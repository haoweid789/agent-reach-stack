"""End-to-end smoke test for the Python SDK.

Exercises the real agent-reach CLI and a live A2A server. Skipped
automatically when the CLI is not installed.

Run with::

    python -m tests.smoke
    # or
    python tests/smoke.py
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, List, Tuple

from agent_reach import AsyncReachClient, ReachClient, resolve_agent_reach_bin
from agent_reach.adapters.crewai import ReachTool
from agent_reach.adapters.langgraph import create_reach_node

REPO_ROOT = Path(__file__).resolve().parents[3]
A2A_SERVER = REPO_ROOT / "dist" / "a2a-server.js"

_results: List[Tuple[str, bool, str]] = []


def record(name: str, passed: bool, detail: str = "") -> None:
    _results.append((name, passed, detail))
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] {name}{f' - {detail}' if detail else ''}")


def _cli_available() -> bool:
    try:
        binary = resolve_agent_reach_bin()
        return bool(shutil.which(binary) or Path(binary).exists())
    except Exception:  # noqa: BLE001
        return False


def test_cli_transport() -> None:
    """The CLI transport lists channels and performs a real search."""
    reach = ReachClient(mode="cli")

    listed = reach.list_channels()
    record("CLI list_channels ok", listed.ok, listed.error.message if listed.error else "")

    search = reach.execute("github", "search", {"query": "react hooks", "limit": 3})
    count = len(search.items)
    record(
        "CLI github search returns items",
        search.ok and count > 0,
        f"{count} items" if search.ok else (search.error.message if search.error else ""),
    )

    if count:
        print(f"       first: {search.items[0].title} -> {search.items[0].url}")


def test_local_validation() -> None:
    """Unknown channels are rejected locally, without spawning a process."""
    reach = ReachClient(mode="cli")

    bad = reach.execute("definitely-not-a-channel", "search", {"query": "x"})
    record(
        "unknown channel rejected without spawning",
        (not bad.ok) and bad.error is not None and bad.error.code == "UNKNOWN_CHANNEL",
        bad.error.code if bad.error else "",
    )


def test_adapter_integration() -> None:
    """The adapters work against the real CLI."""
    node = create_reach_node("github", "search", {"query": "agent-reach", "limit": 2})
    result = node({})
    text = result.get("reach", "")
    record("LangGraph node returns text", bool(text), text.splitlines()[0] if text else "")

    tool = ReachTool("github", "search")
    tool_text = tool.run(query="agent-reach", limit=2)
    record("CrewAI tool returns text", bool(tool_text))


def test_a2a_transport() -> None:
    """Start the A2A server and talk to it over JSON-RPC."""
    if not A2A_SERVER.exists():
        record("A2A server available", False, f"not built: {A2A_SERVER}")
        return

    port = 8093
    env = {**os.environ, "PORT": str(port), "HOST": "127.0.0.1"}
    node = shutil.which("node") or "node"
    server = subprocess.Popen(  # noqa: S603
        [node, str(A2A_SERVER)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    try:
        base_url = f"http://127.0.0.1:{port}"

        # Wait for the server to come up.
        ready = False
        for _ in range(40):
            time.sleep(0.25)
            try:
                import httpx

                if httpx.get(f"{base_url}/health", timeout=2).status_code == 200:
                    ready = True
                    break
            except Exception:  # noqa: BLE001
                continue

        if not ready:
            record("A2A server starts", False, "health check timeout")
            return

        record("A2A server starts", True, base_url)

        reach = ReachClient(mode="a2a", base_url=base_url)

        card = reach.list_channels()
        record(
            "A2A agent card lists skills",
            card.ok and len(card.items) > 0,
            f"{len(card.items)} skills",
        )

        task = reach.execute("github", "search", {"query": "agent-reach", "limit": 2})
        count = len(task.items)
        record(
            "A2A task executes and returns items",
            task.ok and count > 0,
            f"{count} items" if task.ok else (task.error.message if task.error else ""),
        )

        if count:
            print(f"       first: {task.items[0].title}")
            # The structured data part must survive the round-trip.
            record(
                "A2A items keep their URL",
                bool(task.items[0].url),
                task.items[0].url,
            )
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover
            server.kill()


def test_async_client() -> None:
    """The async client works against the real CLI."""

    async def run() -> Tuple[bool, str]:
        reach = AsyncReachClient(mode="cli")
        result = await reach.execute("github", "search", {"query": "async test", "limit": 2})
        return result.ok, f"{len(result.items)} items"

    ok, detail = asyncio.run(run())
    record("Async client executes", ok, detail)


def main() -> int:
    print("=== Agent-Reach Python SDK smoke test ===\n")

    if not _cli_available():
        print("agent-reach CLI not found - skipping CLI-dependent checks")
        return 0

    test_cli_transport()
    test_local_validation()
    test_adapter_integration()
    test_async_client()
    test_a2a_transport()

    passed = sum(1 for _, ok, _ in _results if ok)
    total = len(_results)
    print(f"\n{passed}/{total} checks passed")

    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
