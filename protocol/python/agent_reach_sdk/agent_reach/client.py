"""The unified Agent-Reach client.

``ReachClient`` and ``AsyncReachClient`` wrap a transport and expose one
stable API. The async variant exists because every mainstream Python agent
framework (LangGraph, CrewAI, AutoGen) is async-first.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from .a2a_transport import A2ATransport, AsyncA2ATransport
from .channels import CHANNEL_DEFINITIONS, get_action, get_channel
from .cli_transport import AsyncCliTransport, CliTransport
from .types import (
    AsyncReachTransport,
    CallOptions,
    ReachError,
    ReachParams,
    ReachResult,
    ReachTransport,
)

__all__ = ["ReachClient", "AsyncReachClient", "create_reach", "create_async_reach"]


def _validate(
    channel: str,
    action: str,
    params: ReachParams,
) -> Optional[ReachResult]:
    """Validate a call against the catalog.

    Returns an error result when the call is invalid, so bad input fails
    before any process is spawned or request is sent.
    """
    definition = get_channel(channel)
    if definition is None:
        return ReachResult(
            ok=False,
            error=ReachError(
                code="UNKNOWN_CHANNEL",
                message=f"Unknown channel: {channel}",
                hint=f"Available channels: {', '.join(c.id for c in CHANNEL_DEFINITIONS)}",
            ).to_payload(),
        )

    action_definition = get_action(channel, action)
    if action_definition is None:
        return ReachResult(
            ok=False,
            error=ReachError(
                code="UNKNOWN_ACTION",
                message=f"Unknown action: {action} for channel {channel}",
                hint=f"Available actions: {', '.join(a.name for a in definition.actions)}",
            ).to_payload(),
        )

    for param in action_definition.params:
        if param.required and (params.get(param.name) is None or params.get(param.name) == ""):
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="MISSING_PARAM",
                    message=f"Required parameter missing: {param.name}",
                ).to_payload(),
            )

    return None


def _filter_params(channel: str, action: str, params: ReachParams) -> ReachParams:
    """Keep only the parameters the action actually defines."""
    action_definition = get_action(channel, action)
    if action_definition is None:
        return {}

    allowed = {p.name for p in action_definition.params}
    return {k: v for k, v in params.items() if k in allowed and v is not None}


class ReachClient:
    """Synchronous client over the Agent-Reach platform catalog.

    Example::

        reach = ReachClient()
        result = reach.execute("github", "search", {"query": "react hooks"})
        for item in result.items:
            print(item.title, item.url)
    """

    def __init__(
        self,
        transport: Optional[ReachTransport] = None,
        mode: str = "cli",
        base_url: Optional[str] = None,
        bin_path: Optional[str] = None,
        timeout_ms: Optional[int] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self._transport = transport or _create_transport(
            mode=mode,
            base_url=base_url,
            bin_path=bin_path,
            timeout_ms=timeout_ms,
            headers=headers,
        )

    @property
    def transport_name(self) -> str:
        """The transport in use."""
        return self._transport.name

    def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        """Execute a channel action.

        :param channel: Platform id, e.g. ``github``, ``bilibili``
        :param action: Action name, e.g. ``search``, ``read``
        :param params: Action parameters, validated against the catalog
        """
        resolved = dict(params or {})
        error = _validate(channel, action, resolved)
        if error is not None:
            return error

        return self._transport.execute(
            channel, action, _filter_params(channel, action, resolved), options
        )

    def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        """Read any public URL, auto-detecting the platform."""
        if not url or not url.lower().startswith(("http://", "https://")):
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="INVALID_URL",
                    message=f"Expected an absolute http(s) URL, got: {url}",
                ).to_payload(),
            )

        return self._transport.read(url, options)

    def search(
        self,
        channel: str,
        query: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        """Convenience wrapper for the ``search`` action of a channel."""
        merged: ReachParams = {"query": query}
        merged.update(params or {})
        return self.execute(channel, "search", merged, options)

    def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        """List the channels available on the server."""
        return self._transport.list_channels(options)

    @staticmethod
    def channels() -> List[Dict[str, Any]]:
        """The statically known platform catalog."""
        return [
            {
                "id": channel.id,
                "name": channel.name,
                "description": channel.description,
                "actions": [
                    {
                        "name": action.name,
                        "description": action.description,
                        "params": [
                            {
                                "name": param.name,
                                "type": param.type,
                                "description": param.description,
                                "required": param.required,
                                "default": param.default,
                            }
                            for param in action.params
                        ],
                    }
                    for action in channel.actions
                ],
            }
            for channel in CHANNEL_DEFINITIONS
        ]

    @staticmethod
    def get_channel(channel_id: str):
        """Look up a channel definition from the static catalog."""
        return get_channel(channel_id)

    @staticmethod
    def get_action(channel_id: str, action_name: str):
        """Look up an action definition from the static catalog."""
        return get_action(channel_id, action_name)


class AsyncReachClient:
    """Asynchronous client over the Agent-Reach platform catalog.

    Example::

        reach = AsyncReachClient()
        result = await reach.execute("github", "search", {"query": "react hooks"})
    """

    def __init__(
        self,
        transport: Optional[AsyncReachTransport] = None,
        mode: str = "cli",
        base_url: Optional[str] = None,
        bin_path: Optional[str] = None,
        timeout_ms: Optional[int] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self._transport = transport or _create_async_transport(
            mode=mode,
            base_url=base_url,
            bin_path=bin_path,
            timeout_ms=timeout_ms,
            headers=headers,
        )

    @property
    def transport_name(self) -> str:
        return self._transport.name

    async def execute(
        self,
        channel: str,
        action: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        """Execute a channel action."""
        resolved = dict(params or {})
        error = _validate(channel, action, resolved)
        if error is not None:
            return error

        return await self._transport.execute(
            channel, action, _filter_params(channel, action, resolved), options
        )

    async def read(self, url: str, options: Optional[CallOptions] = None) -> ReachResult:
        """Read any public URL, auto-detecting the platform."""
        if not url or not url.lower().startswith(("http://", "https://")):
            return ReachResult(
                ok=False,
                error=ReachError(
                    code="INVALID_URL",
                    message=f"Expected an absolute http(s) URL, got: {url}",
                ).to_payload(),
            )

        return await self._transport.read(url, options)

    async def search(
        self,
        channel: str,
        query: str,
        params: Optional[ReachParams] = None,
        options: Optional[CallOptions] = None,
    ) -> ReachResult:
        """Convenience wrapper for the ``search`` action of a channel."""
        merged: ReachParams = {"query": query}
        merged.update(params or {})
        return await self.execute(channel, "search", merged, options)

    async def list_channels(self, options: Optional[CallOptions] = None) -> ReachResult:
        """List the channels available on the server."""
        return await self._transport.list_channels(options)


def _create_transport(
    mode: str,
    base_url: Optional[str],
    bin_path: Optional[str],
    timeout_ms: Optional[int],
    headers: Optional[Dict[str, str]],
) -> ReachTransport:
    if mode == "a2a":
        return A2ATransport(
            base_url=base_url,
            timeout_ms=timeout_ms or 120_000,
            headers=headers,
        )
    return CliTransport(bin_path=bin_path, timeout_ms=timeout_ms or 120_000)


def _create_async_transport(
    mode: str,
    base_url: Optional[str],
    bin_path: Optional[str],
    timeout_ms: Optional[int],
    headers: Optional[Dict[str, str]],
) -> AsyncReachTransport:
    if mode == "a2a":
        return AsyncA2ATransport(
            base_url=base_url,
            timeout_ms=timeout_ms or 120_000,
            headers=headers,
        )
    return AsyncCliTransport(bin_path=bin_path, timeout_ms=timeout_ms or 120_000)


def create_reach(**kwargs: Any) -> ReachClient:
    """Convenience factory: ``reach = create_reach()``."""
    return ReachClient(**kwargs)


def create_async_reach(**kwargs: Any) -> AsyncReachClient:
    """Convenience factory: ``reach = create_async_reach()``."""
    return AsyncReachClient(**kwargs)
