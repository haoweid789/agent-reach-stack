"""LangGraph adapter for Agent-Reach.

Example::

    from agent_reach.adapters.langgraph import create_reach_node

    graph.add_node("search_github", create_reach_node("github", "search"))

``langgraph`` is an optional extra - this module never imports it, so the
adapter works with any LangGraph version.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, Optional, Union

from ..client import AsyncReachClient, ReachClient
from ..types import CallOptions, ReachParams
from ._base import build_action_schema, coerce_params

__all__ = [
    "create_reach_node",
    "create_reach_read_node",
    "create_reach_tool",
    "ReachToolSpec",
]


class ReachToolSpec:
    """A LangChain-style tool spec built from a channel action."""

    def __init__(
        self,
        name: str,
        description: str,
        schema: Dict[str, Any],
        func: Callable[[Dict[str, Any]], str],
        async_func: Callable[[Dict[str, Any]], Awaitable[str]],
    ) -> None:
        self.name = name
        self.description = description
        self.schema = schema
        self.func = func
        self.async_func = async_func

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ReachToolSpec(name={self.name!r})"


def _make_client(
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> ReachClient:
    return ReachClient(
        transport=transport,
        mode=mode,
        base_url=base_url,
        bin_path=bin_path,
        timeout_ms=timeout_ms,
        headers=headers,
    )


def _make_async_client(
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> AsyncReachClient:
    return AsyncReachClient(
        transport=transport,
        mode=mode,
        base_url=base_url,
        bin_path=bin_path,
        timeout_ms=timeout_ms,
        headers=headers,
    )


def create_reach_node(
    channel: str,
    action: str,
    params: Optional[ReachParams] = None,
    output_key: str = "reach",
    input_key: str = "reachArgs",
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> Callable[[Dict[str, Any]], Dict[str, Any]]:
    """Create a LangGraph node that performs a channel action.

    The node reads its arguments from ``state[input_key]`` and writes the
    formatted result to ``state[output_key]``.

    :param channel: Platform id, e.g. ``github``
    :param action: Action name, e.g. ``search``
    :param params: Static parameters merged into every call
    :raises ValueError: If the channel or action is unknown
    """
    # Validate eagerly so graph construction fails fast.
    schema = build_action_schema(channel, action)
    static_params = dict(params or {})
    client = _make_client(mode, base_url, bin_path, timeout_ms, headers, transport)

    def node(state: Dict[str, Any]) -> Dict[str, Any]:
        raw = state.get(input_key) if isinstance(state, dict) else None
        dynamic = raw if isinstance(raw, dict) else {}

        merged = coerce_params(channel, action, {**dynamic, **static_params})
        result = client.execute(channel, action, merged)
        return {output_key: result.text}

    node.__name__ = f"reach_{channel}_{action}"
    node.__doc__ = (
        f"Agent-Reach node for {channel}.{action}. "
        f"Parameters: {', '.join(schema['properties'].keys())}."
    )
    # Expose the schema so callers can build their own tool wrappers.
    node.reach_schema = schema  # type: ignore[attr-defined]
    return node


def create_reach_async_node(
    channel: str,
    action: str,
    params: Optional[ReachParams] = None,
    output_key: str = "reach",
    input_key: str = "reachArgs",
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]:
    """Async variant of :func:`create_reach_node`.

    LangGraph supports async nodes, and the async transport avoids blocking
    the event loop while the CLI runs.
    """
    schema = build_action_schema(channel, action)
    static_params = dict(params or {})
    client = _make_async_client(mode, base_url, bin_path, timeout_ms, headers)

    async def node(state: Dict[str, Any]) -> Dict[str, Any]:
        raw = state.get(input_key) if isinstance(state, dict) else None
        dynamic = raw if isinstance(raw, dict) else {}

        merged = coerce_params(channel, action, {**dynamic, **static_params})
        result = await client.execute(channel, action, merged)
        return {output_key: result.text}

    node.__name__ = f"reach_{channel}_{action}"
    node.reach_schema = schema  # type: ignore[attr-defined]
    return node


def create_reach_read_node(
    output_key: str = "reach",
    input_key: str = "reachArgs",
    url_key: str = "url",
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> Callable[[Dict[str, Any]], Dict[str, Any]]:
    """Create a node that reads an arbitrary URL, auto-detecting the platform."""
    client = _make_client(mode, base_url, bin_path, timeout_ms, headers, transport)

    def node(state: Dict[str, Any]) -> Dict[str, Any]:
        source = state if isinstance(state, dict) else {}
        url = source.get(url_key)
        if not isinstance(url, str):
            raw = source.get(input_key)
            url = raw.get(url_key) if isinstance(raw, dict) else None

        if not url:
            return {
                output_key: f"Error: no URL provided (set state.{url_key} or state.{input_key}.{url_key})"
            }

        result = client.read(url)
        return {output_key: result.text}

    node.__name__ = "reach_read"
    return node


def create_reach_tool(
    channel: str,
    action: str,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> ReachToolSpec:
    """Create a LangChain-style tool spec for a channel action.

    Useful when you want the tool registered with LangChain's tool registry
    rather than wired into a graph directly.
    """
    from ..channels import get_action, get_channel

    definition = get_channel(channel)
    action_definition = get_action(channel, action)
    if definition is None or action_definition is None:
        raise ValueError(f"Unknown channel/action: {channel}/{action}")

    schema = build_action_schema(channel, action)
    client = _make_client(mode, base_url, bin_path, timeout_ms, headers, transport)
    async_client = _make_async_client(mode, base_url, bin_path, timeout_ms, headers, transport)

    def func(args: Dict[str, Any]) -> str:
        result = client.execute(channel, action, coerce_params(channel, action, args))
        return result.text

    async def async_func(args: Dict[str, Any]) -> str:
        result = await async_client.execute(
            channel, action, coerce_params(channel, action, args)
        )
        return result.text

    return ReachToolSpec(
        name=f"{channel}_{action}",
        description=f"[{definition.name}] {action_definition.description}",
        schema=schema,
        func=func,
        async_func=async_func,
    )
