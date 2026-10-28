"""Agent-Reach SDK types.

Mirrors the TypeScript SDK so the two stay behaviourally identical:
errors are values (not exceptions), results are normalized, and the
channel catalog is shared.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Union

__all__ = [
    "ReachItem",
    "ReachErrorPayload",
    "ReachResult",
    "ReachError",
    "ReachTransport",
    "AsyncReachTransport",
    "ReachParams",
    "CallOptions",
]


# A parameter value accepted by a channel action.
ReachParams = Dict[str, Union[str, int, float, bool, None]]


@dataclass
class CallOptions:
    """Options accepted by every call."""

    #: Force a specific backend instead of the automatic fallback chain.
    backend: Optional[str] = None
    #: Per-call timeout in milliseconds.
    timeout_ms: Optional[int] = None


@dataclass
class ReachItem:
    """A single retrieved item."""

    title: str = ""
    url: str = ""
    author: Optional[str] = None
    published_at: Optional[str] = None
    text: str = ""
    raw: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "author": self.author,
            "published_at": self.published_at,
            "text": self.text,
            "raw": self.raw,
        }


@dataclass
class ReachErrorPayload:
    """Structured error returned by the Agent-Reach backend."""

    code: str
    message: str
    hint: Optional[str] = None
    retry_after_seconds: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "hint": self.hint,
            "retry_after_seconds": self.retry_after_seconds,
        }


@dataclass
class ReachResult:
    """Normalized result of a reach operation.

    Errors are reported as a value rather than raised, so callers can branch
    on ``result.error.code`` without try/except noise.
    """

    ok: bool = True
    items: List[ReachItem] = field(default_factory=list)
    error: Optional[ReachErrorPayload] = None
    meta: Optional[Dict[str, Any]] = None

    def __bool__(self) -> bool:
        return self.ok

    @property
    def text(self) -> str:
        """The result rendered as readable text.

        Useful for handing straight to an LLM as tool output.
        """
        from ._format import format_result

        return format_result(self)

    def first(self) -> Optional[ReachItem]:
        """The first item, or None."""
        return self.items[0] if self.items else None


class ReachError(Exception):
    """Raised only for transport-level failures.

    Backend errors are returned inside :class:`ReachResult` instead.
    """

    def __init__(
        self,
        code: str,
        message: str,
        hint: Optional[str] = None,
        retry_after_seconds: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.hint = hint
        self.retry_after_seconds = retry_after_seconds

    @classmethod
    def from_exception(cls, exc: BaseException) -> "ReachError":
        if isinstance(exc, ReachError):
            return exc
        return cls(code="UNKNOWN_ERROR", message=str(exc))

    def to_payload(self) -> ReachErrorPayload:
        return ReachErrorPayload(
            code=self.code,
            message=self.message,
            hint=self.hint,
            retry_after_seconds=self.retry_after_seconds,
        )


class ReachTransport(Protocol):
    """Synchronous transport contract."""

    name: str

    def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        ...

    def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        ...

    def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        ...


class AsyncReachTransport(Protocol):
    """Asynchronous transport contract."""

    name: str

    async def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        ...

    async def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        ...

    async def list_channels(
        self, options: Optional[CallOptions] = None
    ) -> ReachResult:
        ...
