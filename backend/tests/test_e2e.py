#!/usr/bin/env python3
"""End-to-end tests against the mock Firecrawl service.

Properties under test:
  - with Firecrawl configured it is the FIRST backend, ahead of jina/exa
  - an install with no config is stock behaviour (no extra attempts, no map)
  - a broken Firecrawl falls back instead of failing the whole call
  - a site Firecrawl refuses (403/451) is NOT treated as a caller error, so the
    chain keeps going instead of short-circuiting
  - rejections the caller can fix (bad URL, 401, keyless map) stop the chain
  - channels whose public path reuses WebChannel inherit the Firecrawl backend
  - `map` discovers URLs and degrades cleanly without a key

Each case runs with a throwaway HOME so agent-reach's backend-health ledger
(state.json) cannot leak a 120s pause from one case into the next.

    python tests/test_e2e.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("MOCK_PORT", "3012"))
BASE = f"http://127.0.0.1:{PORT}"
KEY = "test-secret-key"
KEY_PORT = 3013

results: list[tuple[str, bool, str]] = []


def _clean_env(home: Path, extra: dict | None = None) -> dict:
    env = {k: v for k, v in os.environ.items() if not k.startswith(("FC_", "FIRECRAWL_"))}
    env.update(HOME=str(home), USERPROFILE=str(home))
    env.update(extra or {})
    return env


def run(args: list[str], extra_env: dict | None = None, timeout: int = 180) -> dict:
    with tempfile.TemporaryDirectory() as home:
        env = _clean_env(Path(home), extra_env)
        proc = subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env)
    try:
        return json.loads(proc.stdout.strip())
    except ValueError:
        return {"_raw": proc.stdout.strip()[:400], "_stderr": proc.stderr.strip()[-400:],
                "_code": proc.returncode}


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, cond, detail))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not cond else ""))


def attempts_of(d: dict) -> list[tuple]:
    return [(a.get("backend"), a.get("result"), a.get("skipped", False))
            for a in d.get("meta", {}).get("attempts", [])]


def web_actions(extra_env: dict) -> dict:
    d = run(["agent-reach", "channels"], extra_env)
    for ch in d.get("channels", []):
        if ch["name"] == "web":
            return {a["name"]: a["backends"] for a in ch["actions"]}
    return {}


def start_mock(port: int, key: str | None = None) -> subprocess.Popen:
    args = [sys.executable, str(ROOT / "tests" / "mock_firecrawl.py"), "--port", str(port)]
    if key:
        args += ["--require-key", key]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    return proc


def main() -> int:
    configured = {"FC_BASE_URL": BASE}

    # ── backend ordering ────────────────────────────────────────────────────
    acts = web_actions(configured)
    check("配置后 firecrawl 是 read 的首选", acts.get("read", [])[:1] == ["firecrawl"], f"{acts.get('read')}")
    check("jina / exa 仍作为回退保留", acts.get("read", [])[-2:] == ["jina", "exa"], f"{acts.get('read')}")
    check("search 链 firecrawl -> exa", acts.get("search") == ["firecrawl", "exa"], f"{acts.get('search')}")
    check("map 动作已注册", "map" in acts and acts["map"] == ["firecrawl"], f"{acts.get('map')}")

    # ── happy path ──────────────────────────────────────────────────────────
    d = run(["agent-reach", "web", "read", "https://example.com"], configured)
    check("read 经 firecrawl 成功", d.get("ok") is True and d.get("backend") == "firecrawl",
          f"backend={d.get('backend')} err={d.get('error')}")
    items = d.get("items") or []
    check("取到标题", bool(items and items[0].get("title")))
    check("取到正文", bool(items and len(items[0].get("text", "")) > 20))
    check("只尝试 firecrawl 一次（无多余回退）", len(attempts_of(d)) == 1, str(attempts_of(d)))

    d = run(["agent-reach", "web", "search", "example query"], configured)
    check("search 经 firecrawl 成功", d.get("ok") is True and d.get("backend") == "firecrawl",
          f"backend={d.get('backend')} err={d.get('error')}")
    check("search 返回结果", len(d.get("items") or []) >= 1)

    # ── unconfigured == stock ───────────────────────────────────────────────
    acts = web_actions({})
    check("未配置时 firecrawl 不在任何链中",
          all("firecrawl" not in v for v in acts.values()), f"{acts}")
    check("未配置时没有 map 动作", "map" not in acts, f"{list(acts)}")
    d = run(["agent-reach", "web", "read", "https://example.com"], {})
    check("未配置时不记录 firecrawl 尝试",
          all(b != "firecrawl" for b, _, _ in attempts_of(d)), str(attempts_of(d)))

    # ── delegation: a channel whose public path reuses WebChannel ───────────
    # linkedin read has public_web scopes, so its public attempt runs web read.
    d = run(["agent-reach", "linkedin", "read", "https://www.linkedin.com/jobs/view/1/"],
            configured, timeout=120)
    seen = [a.get("backend") for a in d.get("meta", {}).get("attempts", [])]
    check("public_web 路径继承了 firecrawl 后端",
          any(str(b).endswith("firecrawl") for b in seen), f"attempts={seen}")

    # ── failure handling ────────────────────────────────────────────────────
    d = run(["agent-reach", "web", "read", "https://example.com/fail"], configured)
    seen = attempts_of(d)
    check("上游 5xx 后链继续走其他后端", bool(seen) and seen[0][0] == "firecrawl" and len(seen) > 1, str(seen))

    d = run(["agent-reach", "web", "read", "https://example.com/blocked"], configured)
    seen = attempts_of(d)
    check("Firecrawl 拒抓(403)不终止链", bool(seen) and seen[0][0] == "firecrawl" and len(seen) > 1, str(seen))
    check("Firecrawl 拒抓(403)记为 UPSTREAM_BROKEN 而非 BAD_INPUT",
          bool(seen) and seen[0][1] == "UPSTREAM_BROKEN", str(seen[:1]))

    d = run(["agent-reach", "web", "read", "not-a-url"], configured)
    seen = attempts_of(d)
    check("非法 URL 报 BAD_INPUT", (d.get("error") or {}).get("code") == "BAD_INPUT", str(d.get("error")))
    check("非法 URL 不级联", len(seen) == 1, str(seen))

    # ── auth ────────────────────────────────────────────────────────────────
    keyed = start_mock(KEY_PORT, KEY)
    try:
        env_wrong = {"FC_BASE_URL": f"http://127.0.0.1:{KEY_PORT}", "FC_API_KEY": "wrong-key"}
        d = run(["agent-reach", "web", "read", "https://example.com"], env_wrong)
        check("错误密钥报 BAD_INPUT", (d.get("error") or {}).get("code") == "BAD_INPUT", str(d.get("error")))

        env_ok = {"FC_BASE_URL": f"http://127.0.0.1:{KEY_PORT}", "FC_API_KEY": KEY}
        d = run(["agent-reach", "web", "read", "https://example.com"], env_ok)
        check("正确密钥可读取", d.get("ok") is True and d.get("backend") == "firecrawl",
              f"backend={d.get('backend')} err={d.get('error')}")

        d = run(["agent-reach", "web", "map", "https://example.com", "--limit", "3"], env_ok)
        check("map 返回 URL 列表", d.get("ok") is True and len(d.get("items") or []) == 3,
              f"items={len(d.get('items') or [])} err={d.get('error')}")
        check("map 条目带 url 字段", all(i.get("url") for i in (d.get("items") or [])))
    finally:
        keyed.terminate()
        keyed.wait(timeout=10)

    # ── map against the keyless hosted tier (opt-in: costs a network round trip) ──
    # The mock accepts every request, so keyless gating can only be observed on
    # the real service. Run with FIREcrawl_LIVE=1 to include it.
    if os.environ.get("FIRECRAWL_LIVE") == "1":
        d = run(["agent-reach", "web", "map", "https://example.com"],
                {"FC_BASE_URL": "https://api.firecrawl.dev"}, timeout=90)
        code = (d.get("error") or {}).get("code")
        check("托管无 key 时 map 明确报错而非空成功",
              d.get("ok") is False and code in {"BAD_INPUT", "NEED_SETUP", "RATE_LIMITED", "UPSTREAM_BROKEN"},
              f"code={code}")
    else:
        print("SKIP  托管无 key 的 map 行为（需要 FIRECRAWL_LIVE=1）")

    ok = sum(1 for _, c, _ in results if c)
    total = len(results)
    print(f"\n{ok}/{total} passed")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
