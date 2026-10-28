"""AutoGen / AG2 adapter for Agent-Reach.

Example::

    from agent_reach.adapters.autogen import ReachFunction

    assistant = ConversableAgent(functions=[ReachFunction("bilibili", "read")])

``@ag2/autogen`` and ``@microsoft/autogen`` are optional extras - this module
never imports them. The function objects it produces use the plain
``{name, description, parameters, execute}`` shape that AutoGen accepts.
"""

from __future__ import annotations

import inspect
from typing import Any, Awaitable, Callable, Dict, List, Optional

from ..channels import get_action, get_channel
from ..client import AsyncReachClient, ReachClient
from ._base import build_action_schema, coerce_params

__all__ = [
    "ReachFunction",
    "ReachReadFunction",
    "ReachChannelFunctions",
    "ReachFunctions",
]


class ReachAutoGenFunction:
    """An AutoGen-compatible function bound to a channel action."""

    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        execute: Callable[[Dict[str, Any]], str],
        aexecute: Optional[Callable[[Dict[str, Any]], Awaitable[str]]] = None,
    ) -> None:
        self.name = name
        self.description = description
        self.parameters = parameters
        self._execute = execute
        self._aexecute = aexecute

    def execute(self, *args: Any, **kwargs: Any) -> str:
        """Execute the function.

        AutoGen calls functions with keyword arguments; positional dict
        arguments are accepted too.
        """
        payload = _collect_args(args, kwargs)
        return self._execute(payload)

    async def aexecute(self, *args: Any, **kwargs: Any) -> str:
        """Async execution."""
        if self._aexecute is None:
            return self.execute(*args, **kwargs)
        return await self._aexecute(_collect_args(args, kwargs))

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ReachAutoGenFunction(name={self.name!r})"


def _collect_args(args: tuple, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for arg in args:
        if isinstance(arg, dict):
            payload.update(arg)
        else:
            payload["input"] = arg
    payload.update(kwargs)
    return payload


def ReachFunction(  # noqa: N802
    channel: str,
    action: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> ReachAutoGenFunction:
    """Create an AutoGen function bound to a channel action.

    :param channel: Platform id, e.g. ``bilibili``
    :param action: Action name, e.g. ``read``
    :raises ValueError: If the channel or action is unknown
    """
    definition = get_channel(channel)
    action_definition = get_action(channel, action)
    if definition is None or action_definition is None:
        raise ValueError(f"Unknown channel/action: {channel}/{action}")

    schema = build_action_schema(channel, action)
    client = ReachClient(
        transport=transport,
        mode=mode,
        base_url=base_url,
        bin_path=bin_path,
        timeout_ms=timeout_ms,
        headers=headers,
    )
    async_client = AsyncReachClient(
        transport=transport,
        mode=mode,
        base_url=base_url,
        bin_path=bin_path,
        timeout_ms=timeout_ms,
        headers=headers,
    )

    def execute(args: Dict[str, Any]) -> str:
        result = client.execute(channel, action, coerce_params(channel, action, args))
        return result.text

    async def aexecute(args: Dict[str, Any]) -> str:
        result = await async_client.execute(
            channel, action, coerce_params(channel, action, args)
        )
        return result.text

    param_names = ", ".join(p.name for p in action_definition.params)
    return ReachAutoGenFunction(
        name=name or f"{channel}_{action}",
        description=description
        or (
            f"[{definition.name}] {action_definition.description}. "
            f"Parameters: {param_names}."
        ),
        parameters=schema,
        execute=execute,
        aexecute=aexecute,
    )


def ReachReadFunction(  # noqa: N802
    name: Optional[str] = None,
    description: Optional[str] = None,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> ReachAutoGenFunction:
    """Create a function that reads any public URL, auto-detecting the platform."""
    client = ReachClient(
        transport=transport,
        mode=mode,
        base_url=base_url,
        bin_path=bin_path,
        timeout_ms=timeout_ms,
        headers=headers,
    )
    async_client = AsyncReachClient(
        transport=transport,
        mode=mode,
        base_url=base_url,
        bin_path=bin_path,
        timeout_ms=timeout_ms,
        headers=headers,
    )

    def execute(args: Dict[str, Any]) -> str:
        url = args.get("url") or args.get("target") or ""
        return client.read(str(url)).text

    async def aexecute(args: Dict[str, Any]) -> str:
        url = args.get("url") or args.get("target") or ""
        result = await async_client.read(str(url))
        return result.text

    return ReachAutoGenFunction(
        name=name or "read_url",
        description=description
        or (
            "Read any public URL. The platform is detected automatically "
            "(GitHub, Bilibili, YouTube, Twitter, Reddit, Xiaohongshu, ...)."
        ),
        parameters={
            "type": "object",
            "properties": {"url": {"type": "string", "description": "The URL to read"}},
            "required": ["url"],
        },
        execute=execute,
        aexecute=aexecute,
    )


def ReachChannelFunctions(  # noqa: N802
    channel: str,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> List[ReachAutoGenFunction]:
    """Create one function per action of a channel."""
    definition = get_channel(channel)
    if definition is None:
        raise ValueError(f"Unknown channel: {channel}")

    return [
        ReachFunction(
            channel,
            action.name,
            mode=mode,
            base_url=base_url,
            bin_path=bin_path,
            timeout_ms=timeout_ms,
            headers=headers,
            transport=transport,
        )
        for action in definition.actions
    ]


def ReachFunctions(  # noqa: N802
    channels: List[Dict[str, Any]],
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> List[ReachAutoGenFunction]:
    """Create functions for several channels at once."""
    functions: List[ReachAutoGenFunction] = []

    for entry in channels:
        channel = entry["channel"]
        action = entry.get("action")
        if action:
            functions.append(
                ReachFunction(
                    channel,
                    action,
                    mode=mode,
                    base_url=base_url,
                    bin_path=bin_path,
                    timeout_ms=timeout_ms,
                    headers=headers,
                )
            )
        else:
            functions.extend(
                ReachChannelFunctions(
                    channel,
                    mode=mode,
                    base_url=base_url,
                    bin_path=bin_path,
                    timeout_ms=timeout_ms,
                    headers=headers,
                )
            )

    return functions
