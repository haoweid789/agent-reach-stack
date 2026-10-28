"""CLI transport - spawns the ``agent-reach`` binary directly.

This is the fastest path for local use: no HTTP round-trip, just a
subprocess. An async variant is provided for use inside async agent
frameworks.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from .types import CallOptions, ReachError, ReachItem, ReachParams, ReachResult

__all__ = [
    "CliTransport",
    "AsyncCliTransport",
    "resolve_agent_reach_bin",
    "parse_cli_output",
    "normalize_result",
]

DEFAULT_TIMEOUT_MS = 120_000


def resolve_agent_reach_bin() -> str:
    """Locate the ``agent-reach`` executable.

    Lookup order:
      1. ``AGENT_REACH_BIN`` environment variable (explicit override)
      2. ``agent-reach`` on ``PATH``
      3. Well-known install locations for the current platform

    No absolute user-specific path is hardcoded - where the CLI lives
    depends on who runs the client.
    """
    override = os.environ.get("AGENT_REACH_BIN")
    if override and Path(override).exists():
        return override

    is_windows = os.name == "nt"
    exe_names = (
        ["agent-reach.cmd", "agent-reach.exe", "agent-reach.bat", "agent-reach"]
        if is_windows
        else ["agent-reach"]
    )

    # 2. Search PATH
    for directory in (os.environ.get("PATH") or "").split(os.pathsep):
        if not directory:
            continue
        for name in exe_names:
            candidate = os.path.join(directory, name)
            if os.path.isfile(candidate):
                return candidate

    # 3. Well-known install locations (uv tool install, pipx, cargo, local build)
    home = Path.home()
    known_dirs = [
        home / ".local" / "bin",
        home / ".local" / "share" / "uv" / "tools" / "agent-reach" / "bin",
        home / ".cargo" / "bin",
        home / "bin",
        home / ".pyenv" / "shims",
        Path("/usr/local/bin"),
        Path("/opt/homebrew/bin"),
    ]

    for directory in known_dirs:
        for name in exe_names:
            candidate = directory / name
            if candidate.is_file():
                return str(candidate)

    # Fall back to the bare name and let the OS resolve it via PATH
    return shutil.which("agent-reach") or ("agent-reach.cmd" if is_windows else "agent-reach")


def _child_env() -> Dict[str, str]:
    """Environment for the child process.

    Prepends the directories that commonly hold the agent-reach CLI to
    PATH, so the backends it launches (gh, yt-dlp, bili-cli...) resolve too.
    """
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"

    home = Path.home()
    extra_dirs = [
        home / ".local" / "bin",
        home / ".local" / "share" / "uv" / "tools" / "agent-reach" / "bin",
        home / ".cargo" / "bin",
        home / "bin",
        Path("/usr/local/bin"),
        Path("/opt/homebrew/bin"),
    ]

    existing = env.get("PATH") or ""
    prefix = os.pathsep.join(
        str(d) for d in extra_dirs if d.is_dir()
    )
    env["PATH"] = f"{prefix}{os.pathsep}{existing}" if prefix else existing
    return env


def normalize_result(payload: Dict[str, Any]) -> ReachResult:
    """Normalize an arbitrary payload into a :class:`ReachResult`."""
    result = ReachResult(ok=payload.get("ok") is not False)

    raw_items = payload.get("items")
    if isinstance(raw_items, list):
        items: List[ReachItem] = []
        for entry in raw_items:
            if not isinstance(entry, dict):
                continue
            items.append(
                ReachItem(
                    title=str(entry.get("title") or ""),
                    url=str(entry.get("url") or ""),
                    author=entry.get("author") if isinstance(entry.get("author"), str) else None,
                    published_at=(
                        entry.get("published_at")
                        if isinstance(entry.get("published_at"), str)
                        else None
                    ),
                    text=str(entry.get("text") or ""),
                    raw=entry.get("raw") if isinstance(entry.get("raw"), dict) else None,
                )
            )
        result.items = items

    raw_error = payload.get("error")
    if isinstance(raw_error, dict):
        result.ok = False
        result.error = ReachError(
            code=str(raw_error.get("code") or "UNKNOWN_ERROR"),
            message=str(raw_error.get("message") or "Unknown error"),
            hint=raw_error.get("hint") if isinstance(raw_error.get("hint"), str) else None,
            retry_after_seconds=(
                raw_error.get("retry_after_seconds")
                if isinstance(raw_error.get("retry_after_seconds"), int)
                else None
            ),
        ).to_payload()

    if isinstance(payload.get("meta"), dict):
        result.meta = payload["meta"]

    return result


def parse_cli_output(stdout: str, stderr: str, code: int) -> ReachResult:
    """Parse the CLI's stdout into a normalized result."""
    trimmed = stdout.strip()

    if not trimmed:
        return ReachResult(
            ok=False,
            error=ReachError(
                code="EMPTY_OUTPUT",
                message="No output from agent-reach",
                hint=stderr or None,
            ).to_payload(),
        )

    # The CLI prints a single JSON object; find it even if a warning precedes it.
    start = trimmed.find("{")
    end = trimmed.rfind("}")
    if start != -1 and end > start:
        candidate = trimmed[start : end + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return normalize_result(parsed)
        except json.JSONDecodeError:
            pass

    # Non-JSON output (e.g. --text mode): wrap it so callers always get items.
    return ReachResult(
        ok=(code == 0),
        items=[ReachItem(title="", url="", text=trimmed)],
    )


class CliTransport:
    """Synchronous transport that shells out to the agent-reach CLI."""

    name = "cli"

    def __init__(
        self,
        bin_path: Optional[str] = None,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
    ) -> None:
        self._bin_path = bin_path
        self._timeout_ms = timeout_ms

    def _build_args(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams],
        options: Optional[CallOptions],
    ) -> List[str]:
        args = [channel, action]

        for value in (params or {}).values():
            if value is not None and value != "":
                args.append(str(value))

        if options and options.backend:
            args.extend(["--backend", options.backend])

        return args

    def _run(self, args: Sequence[str], timeout_ms: Optional[int]) -> ReachResult:
        command = self._bin_path or resolve_agent_reach_bin()
        effective_timeout = (timeout_ms or self._timeout_ms) / 1000.0

        try:
            completed = subprocess.run(  # noqa: S603 - command is resolved above
                [command, *args],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=_child_env(),
                timeout=effective_timeout,
                shell=(os.name == "nt"),
            )
        except subprocess.TimeoutExpired:
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="TIMEOUT",
                    message=(
                        f"agent-reach command timed out after "
                        f"{int(effective_timeout * 1000)}ms"
                    ),
                ).to_payload(),
            )
        except OSError as exc:
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="SPAWN_FAILED",
                    message=f"Failed to spawn agent-reach: {exc}",
                    hint=(
                        "Is the agent-reach CLI installed? "
                        "See https://github.com/Panniantong/Agent-Reach"
                    ),
                ).to_payload(),
            )

        return parse_cli_output(completed.stdout or "", completed.stderr or "", completed.returncode)

    def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        return self._run(
            self._build_args(channel, action, params, options),
            options.timeout_ms if options else None,
        )

    def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        return self._run(["read", url], options.timeout_ms if options else None)

    def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        return self._run(["channels"], options.timeout_ms if options else None)


class AsyncCliTransport:
    """Asynchronous transport that shells out to the agent-reach CLI.

    The subprocess runs in a thread executor so it never blocks the event
    loop.
    """

    name = "cli"

    def __init__(
        self,
        bin_path: Optional[str] = None,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
    ) -> None:
        self._sync = CliTransport(bin_path=bin_path, timeout_ms=timeout_ms)

    async def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        return await asyncio.to_thread(
            self._sync.execute, channel, action, params, options
        )

    async def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        return await asyncio.to_thread(self._sync.read, url, options)

    async def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        return await asyncio.to_thread(self._sync.list_channels, options)
