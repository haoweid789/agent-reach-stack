#!/usr/bin/env python3
"""Cross-layer integration test.

The two layers are only genuinely wired together if an MCP tool call reaches the
Firecrawl backend through the CLI. Unit tests inside each layer cannot show that,
so this drives the real MCP server over stdio and inspects the resulting envelope.

Requires: protocol built (dist/), agent-reach installed, backend patched.
Firecrawl itself is faked by backend/tests/mock_firecrawl.py, so no key is needed.

    python tests/test_integration.py
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTOCOL = ROOT / "protocol"
BACKEND = ROOT / "backend"
MOCK_PORT = 3014
MOCK_BASE = f"http://127.0.0.1:{MOCK_PORT}"

results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, cond, detail))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not cond else ""))


def _port_open(port: int) -> bool:
    s = socket.socket()
    s.settimeout(0.3)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def _start_mock() -> subprocess.Popen:
    proc = subprocess.Popen(
        [sys.executable, str(BACKEND / "tests" / "mock_firecrawl.py"), "--port", str(MOCK_PORT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if _port_open(MOCK_PORT):
            return proc
        time.sleep(0.1)
    proc.terminate()
    raise RuntimeError(f"mock did not start on {MOCK_PORT}")


PROBE = r"""
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: process.env,
});
const client = new Client({ name: "integration", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
const out = { tools: tools.length, names: tools.map(t => t.name), calls: {} };

for (const [label, name, args] of [
  ["map", "web_map", { target: "https://example.com", limit: 3 }],
  ["read", "web_read", { target: "https://example.com" }],
]) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    out.calls[label] = { ok: !res.isError, text: text.slice(0, 1500) };
  } catch (err) {
    out.calls[label] = { ok: false, error: String(err).slice(0, 400) };
  }
}
await client.close();
console.log(JSON.stringify(out));
"""


def main() -> int:
    if not (PROTOCOL / "dist" / "index.js").is_file():
        print("protocol/dist missing — run: python install.py --protocol-only")
        return 1
    if not (PROTOCOL / "node_modules" / "@modelcontextprotocol").is_dir():
        print("protocol dependencies missing — run: python install.py")
        return 1

    mock = _start_mock()
    try:
        env = dict(os.environ)
        env["FC_BASE_URL"] = MOCK_BASE
        env.pop("FC_API_KEY", None)
        env["AGENT_REACH_BIN"] = shutil.which("agent-reach") or "agent-reach"

        probe_file = PROTOCOL / "_integration_probe.mjs"
        probe_file.write_text(PROBE, encoding="utf-8")
        try:
            proc = subprocess.run(["node", str(probe_file)], cwd=str(PROTOCOL), env=env,
                                  capture_output=True, text=True, timeout=180)
        finally:
            probe_file.unlink(missing_ok=True)

        line = ""
        for candidate in reversed(proc.stdout.strip().splitlines()):
            if candidate.startswith("{"):
                line = candidate
                break
        if not line:
            print("probe produced no JSON; stderr tail:")
            print(proc.stderr[-1500:])
            return 1
        data = json.loads(line)

        check("MCP 暴露 web_map", "web_map" in data["names"], str(data["names"])[:200])
        check("MCP 仍暴露 web_read / web_search",
              {"web_read", "web_search"} <= set(data["names"]), str(data["names"])[:200])
        check("工具总数符合预期（41 动作 + auto_read）", data["tools"] == 43, f"tools={data['tools']}")

        read_call = data["calls"].get("read", {})
        check("web_read 调用成功", read_call.get("ok") is True, str(read_call)[:300])
        check("web_read 后端为 firecrawl", "[backend: firecrawl]" in read_call.get("text", ""),
              read_call.get("text", "")[:300])

        map_call = data["calls"].get("map", {})
        check("web_map 调用成功", map_call.get("ok") is True, str(map_call)[:300])
        text = map_call.get("text", "")
        check("web_map 后端为 firecrawl", "[backend: firecrawl]" in text, text[:300])
        check("web_map 返回 URL 条目", "page-1" in text, text[:300])
    finally:
        mock.terminate()
        try:
            mock.wait(timeout=10)
        except subprocess.TimeoutExpired:
            mock.kill()

    ok = sum(1 for _, c, _ in results if c)
    total = len(results)
    print(f"\n{ok}/{total} passed")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
