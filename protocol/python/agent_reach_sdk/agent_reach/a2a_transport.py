"""A2A transport - talks to a running ``agent-reach-a2a`` server.

Use this when the Agent-Reach instance lives on another machine or behind a
service boundary. The local CLI transport is the counterpart for
single-machine setups.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Sequence

try:  # pragma: no cover - httpx is a hard dependency, guard is for clarity
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]

from .types import CallOptions, ReachError, ReachItem, ReachParams, ReachResult

__all__ = [
    "A2ATransport",
    "AsyncA2ATransport",
    "build_prompt",
    "artifacts_to_items",
    "extract_task",
]

DEFAULT_TIMEOUT_MS = 120_000
TERMINAL_STATES = {"COMPLETED", "FAILED", "CANCELED", "REJECTED", "AUTH_REQUIRED"}


def build_prompt(channel: str, action: str, params: Optional[ReachParams]) -> str:
    """Render a channel action as the natural-language prompt the server parses.

    Quoted values survive the server's intent parser. The structured
    metadata channel is the lossless path; this text is a human-readable
    fallback and a debugging aid.
    """
    parts = [f"{channel} {action}"]

    for key, value in (params or {}).items():
        if value is None or value == "":
            continue
        parts.append(f'{key} "{value}"')

    return " ".join(parts)


def extract_task(payload: Any) -> Optional[Dict[str, Any]]:
    """Extract the task object from an A2A response.

    The server wraps the task in ``{"task": ...}`` for ``tasks/get`` but
    returns it bare for ``tasks/send``. Both shapes are accepted.
    """
    if not isinstance(payload, dict):
        return None

    inner = payload.get("task")
    if isinstance(inner, dict):
        return inner

    if isinstance(payload.get("id"), str) and isinstance(payload.get("status"), dict):
        return payload

    if isinstance(payload.get("taskId"), str):
        return {
            "id": payload["taskId"],
            "contextId": payload.get("contextId", ""),
            "status": {"state": "WORKING"},
        }

    return None


def artifacts_to_items(artifacts: Sequence[Dict[str, Any]]) -> List[ReachItem]:
    """Convert A2A artifacts back into SDK items.

    An artifact may carry a text rendering, a structured data part, or both.
    When both are present the structured data wins, because it preserves the
    individual fields instead of a flattened string.
    """
    items: List[ReachItem] = []

    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue

        parts = artifact.get("parts") or []
        data_part = next(
            (p for p in parts if isinstance(p, dict) and p.get("type") == "data" and p.get("data")),
            None,
        )
        text_part = next(
            (p for p in parts if isinstance(p, dict) and p.get("type") == "text" and p.get("text")),
            None,
        )

        if data_part is not None:
            data = data_part.get("data") or {}
            items.append(
                ReachItem(
                    title=str(data.get("title") or artifact.get("name") or ""),
                    url=str(data.get("url") or ""),
                    author=data.get("author") or None,
                    published_at=data.get("published_at") or None,
                    text=str(data.get("text") or ""),
                    raw=data,
                )
            )
            continue

        if text_part is not None:
            items.append(
                ReachItem(
                    title=str(artifact.get("name") or ""),
                    url="",
                    text=str(text_part.get("text") or ""),
                )
            )

    return items


class _A2AClient:
    """Shared request logic for the sync and async transports."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.base_url = (base_url or "http://localhost:8080").rstrip("/")
        self.timeout_ms = timeout_ms
        self.headers = headers or {}
        self._request_id = 0

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _next_request_id(self) -> int:
        return self._next_id()

    def build_payload(
        self,
        method: str,
        params: Optional[Dict[str, Any]],
        structured: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        message: Dict[str, Any] = {
            "role": "user",
            "parts": [{"type": "text", "text": ""}],
        }
        if structured is not None:
            message["metadata"] = {"agentReach": structured}
        return {
            "jsonrpc": "2.0",
            "id": self._next_request_id(),
            "method": method,
            "params": params if params is not None else {},
            "_message": message,
        }


def _task_message(prompt: str, structured: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    message: Dict[str, Any] = {
        "role": "user",
        "parts": [{"type": "text", "text": prompt}],
    }
    if structured is not None:
        message["metadata"] = {"agentReach": structured}
    return message


class A2ATransport:
    """Synchronous transport backed by the Agent-Reach A2A server."""

    name = "a2a"

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
        headers: Optional[Dict[str, str]] = None,
        client: Optional[Any] = None,
    ) -> None:
        if httpx is None and client is None:  # pragma: no cover
            raise RuntimeError(
                "httpx is required for the A2A transport. Install it with: pip install httpx"
            )
        self.base_url = (base_url or "http://localhost:8080").rstrip("/")
        self.timeout_ms = timeout_ms
        self.headers = headers or {}
        self._client = client
        self._request_id = 0

    # -- low level ---------------------------------------------------

    def _rpc(
        self,
        method: str,
        params: Dict[str, Any],
        timeout_ms: int,
    ) -> Any:
        self._request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }

        headers = {"Content-Type": "application/json", **self.headers}

        try:
            if self._client is not None:
                response = self._client.post(
                    f"{self.base_url}/rpc", json=payload, headers=headers
                )
                response.raise_for_status()
                body = response.json()
            else:
                with httpx.Client(timeout=timeout_ms / 1000.0) as client:
                    response = client.post(
                        f"{self.base_url}/rpc", json=payload, headers=headers
                    )
                    response.raise_for_status()
                    body = response.json()
        except Exception as exc:  # noqa: BLE001 - normalized below
            raise ReachError(
                code="REQUEST_FAILED",
                message=f"A2A request failed: {exc}",
                hint=f"Is the A2A server running at {self.base_url}?",
            ) from exc

        if isinstance(body, dict) and body.get("error"):
            error = body["error"]
            raise ReachError(
                code=f"JSONRPC_{error.get('code', 'ERROR')}",
                message=str(error.get("message", "Unknown JSON-RPC error")),
            )

        return body.get("result") if isinstance(body, dict) else None

    def _get_agent_card(self, timeout_ms: int) -> Any:
        try:
            if self._client is not None:
                response = self._client.get(f"{self.base_url}/.well-known/agent.json")
                response.raise_for_status()
                return response.json()
            with httpx.Client(timeout=timeout_ms / 1000.0) as client:
                response = client.get(f"{self.base_url}/.well-known/agent.json")
                response.raise_for_status()
                return response.json()
        except Exception as exc:  # noqa: BLE001
            raise ReachError(
                code="REQUEST_FAILED",
                message=f"Failed to reach A2A server at {self.base_url}: {exc}",
            ) from exc

    # -- task flow ---------------------------------------------------

    def _send(
        self,
        prompt: str,
        options: Optional[CallOptions],
        structured: Optional[Dict[str, Any]],
    ) -> ReachResult:
        timeout_ms = (options.timeout_ms if options and options.timeout_ms else self.timeout_ms)
        deadline = time.monotonic() + timeout_ms / 1000.0

        try:
            send_result = self._rpc(
                "tasks/send",
                {"message": _task_message(prompt, structured)},
                timeout_ms,
            )
        except ReachError as exc:
            return ReachResult(ok=False, error=exc.to_payload())

        task = extract_task(send_result)
        if not task or not task.get("id"):
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="BAD_RESPONSE",
                    message="A2A server did not return a task id",
                ).to_payload(),
            )

        # Poll until the task reaches a terminal state.
        while time.monotonic() < deadline:
            state = (task.get("status") or {}).get("state")
            if state in TERMINAL_STATES:
                break

            time.sleep(0.1)

            try:
                get_result = self._rpc("tasks/get", {"id": task["id"]}, timeout_ms)
            except ReachError as exc:
                return ReachResult(ok=False, error=exc.to_payload())

            updated = extract_task(get_result)
            if updated and updated.get("id"):
                task = updated

        state = (task.get("status") or {}).get("state")
        if state not in TERMINAL_STATES:
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="TIMEOUT",
                    message=f"A2A task {task.get('id')} did not complete within {timeout_ms}ms",
                ).to_payload(),
            )

        if state != "COMPLETED":
            message = ""
            status_message = (task.get("status") or {}).get("message") or {}
            for part in status_message.get("parts") or []:
                if isinstance(part, dict) and part.get("text"):
                    message += str(part["text"]) + "\n"
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="TASK_FAILED",
                    message=message.strip() or f"A2A task ended in state {state}",
                ).to_payload(),
            )

        return ReachResult(ok=True, items=artifacts_to_items(task.get("artifacts") or []))

    # -- public API --------------------------------------------------

    def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        # Structured invocation: the server uses these values verbatim instead
        # of parsing natural language, which keeps multi-parameter actions
        # lossless.
        prompt = build_prompt(channel, action, params)
        structured = {
            "channel": channel,
            "action": action,
            "params": {k: v for k, v in (params or {}).items() if v is not None},
        }
        return self._send(prompt, options, structured)

    def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        return self._send(url, options, None)

    def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        timeout_ms = (options.timeout_ms if options and options.timeout_ms else self.timeout_ms)
        try:
            card = self._get_agent_card(timeout_ms)
        except ReachError as exc:
            return ReachResult(ok=False, error=exc.to_payload())

        skills = (card or {}).get("skills") or []
        return ReachResult(
            ok=True,
            items=[
                ReachItem(
                    title=str(skill.get("name") or skill.get("id") or ""),
                    url="",
                    text=str(skill.get("description") or ""),
                )
                for skill in skills
                if isinstance(skill, dict)
            ],
            meta=card,
        )

    def health(self) -> bool:
        """Check whether the server is reachable."""
        try:
            if self._client is not None:
                response = self._client.get(f"{self.base_url}/health")
                return response.status_code == 200
            with httpx.Client(timeout=5.0) as client:
                response = client.get(f"{self.base_url}/health")
                return response.status_code == 200
        except Exception:  # noqa: BLE001
            return False


class AsyncA2ATransport:
    """Asynchronous transport backed by the Agent-Reach A2A server."""

    name = "a2a"

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
        headers: Optional[Dict[str, str]] = None,
        client: Optional[Any] = None,
    ) -> None:
        if httpx is None and client is None:  # pragma: no cover
            raise RuntimeError(
                "httpx is required for the A2A transport. Install it with: pip install httpx"
            )
        self.base_url = (base_url or "http://localhost:8080").rstrip("/")
        self.timeout_ms = timeout_ms
        self.headers = headers or {}
        self._client = client
        self._request_id = 0

    async def _rpc(
        self,
        method: str,
        params: Dict[str, Any],
        timeout_ms: int,
    ) -> Any:
        self._request_id += 1
        payload = {
            "jsonrpc": "2.0",
            "id": self._request_id,
            "method": method,
            "params": params,
        }
        headers = {"Content-Type": "application/json", **self.headers}

        try:
            if self._client is not None:
                response = await self._client.post(
                    f"{self.base_url}/rpc", json=payload, headers=headers
                )
                response.raise_for_status()
                body = response.json()
            else:
                async with httpx.AsyncClient(timeout=timeout_ms / 1000.0) as client:
                    response = await client.post(
                        f"{self.base_url}/rpc", json=payload, headers=headers
                    )
                    response.raise_for_status()
                    body = response.json()
        except Exception as exc:  # noqa: BLE001
            raise ReachError(
                code="REQUEST_FAILED",
                message=f"A2A request failed: {exc}",
                hint=f"Is the A2A server running at {self.base_url}?",
            ) from exc

        if isinstance(body, dict) and body.get("error"):
            error = body["error"]
            raise ReachError(
                code=f"JSONRPC_{error.get('code', 'ERROR')}",
                message=str(error.get("message", "Unknown JSON-RPC error")),
            )

        return body.get("result") if isinstance(body, dict) else None

    async def _send(
        self,
        prompt: str,
        options: Optional[CallOptions],
        structured: Optional[Dict[str, Any]],
    ) -> ReachResult:
        timeout_ms = (options.timeout_ms if options and options.timeout_ms else self.timeout_ms)
        deadline = time.monotonic() + timeout_ms / 1000.0

        try:
            send_result = await self._rpc(
                "tasks/send", {"message": _task_message(prompt, structured)}, timeout_ms
            )
        except ReachError as exc:
            return ReachResult(ok=False, error=exc.to_payload())

        task = extract_task(send_result)
        if not task or not task.get("id"):
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="BAD_RESPONSE",
                    message="A2A server did not return a task id",
                ).to_payload(),
            )

        while time.monotonic() < deadline:
            state = (task.get("status") or {}).get("state")
            if state in TERMINAL_STATES:
                break

            await asyncio.sleep(0.1)

            try:
                get_result = await self._rpc("tasks/get", {"id": task["id"]}, timeout_ms)
            except ReachError as exc:
                return ReachResult(ok=False, error=exc.to_payload())

            updated = extract_task(get_result)
            if updated and updated.get("id"):
                task = updated

        state = (task.get("status") or {}).get("state")
        if state not in TERMINAL_STATES:
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="TIMEOUT",
                    message=f"A2A task {task.get('id')} did not complete within {timeout_ms}ms",
                ).to_payload(),
            )

        if state != "COMPLETED":
            message = ""
            status_message = (task.get("status") or {}).get("message") or {}
            for part in status_message.get("parts") or []:
                if isinstance(part, dict) and part.get("text"):
                    message += str(part["text"]) + "\n"
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="TASK_FAILED",
                    message=message.strip() or f"A2A task ended in state {state}",
                ).to_payload(),
            )

        return ReachResult(ok=True, items=artifacts_to_items(task.get("artifacts") or []))

    async def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        prompt = build_prompt(channel, action, params)
        structured = {
            "channel": channel,
            "action": action,
            "params": {k: v for k, v in (params or {}).items() if v is not None},
        }
        return await self._send(prompt, options, structured)

    async def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        return await self._send(url, options, None)

    async def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        timeout_ms = (options.timeout_ms if options and options.timeout_ms else self.timeout_ms)
        headers = dict(self.headers)

        try:
            if self._client is not None:
                response = await self._client.get(
                    f"{self.base_url}/.well-known/agent.json", headers=headers
                )
                response.raise_for_status()
                card = response.json()
            else:
                async with httpx.AsyncClient(timeout=timeout_ms / 1000.0) as client:
                    response = await client.get(
                        f"{self.base_url}/.well-known/agent.json", headers=headers
                    )
                    response.raise_for_status()
                    card = response.json()
        except Exception as exc:  # noqa: BLE001
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="REQUEST_FAILED",
                    message=f"Failed to reach A2A server at {self.base_url}: {exc}",
                ).to_payload(),
            )

        skills = (card or {}).get("skills") or []
        return ReachResult(
            ok=True,
            items=[
                ReachItem(
                    title=str(skill.get("name") or skill.get("id") or ""),
                    url="",
                    text=str(skill.get("description") or ""),
                )
                for skill in skills
                if isinstance(skill, dict)
            ],
            meta=card,
        )
