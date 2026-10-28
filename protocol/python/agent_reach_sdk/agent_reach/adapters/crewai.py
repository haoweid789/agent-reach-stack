"""CrewAI adapter for Agent-Reach.

Example::

    from agent_reach.adapters.crewai import ReachTool

    agent = Agent(tools=[ReachTool("xiaohongshu", "search")])

``crewai`` is an optional extra - this module never imports it. The tool
objects it produces use the plain ``{name, description, args_schema, run}``
shape that CrewAI accepts.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, List, Optional

from ..channels import get_action, get_channel
from ..client import AsyncReachClient, ReachClient
from ..types import ReachParams
from ._base import build_action_schema, coerce_params

__all__ = [
    "ReachTool",
    "ReachReadTool",
    "ReachChannelTools",
    "ReachTools",
]


class ReachCrewTool:
    """A CrewAI-compatible tool bound to a channel action."""

    def __init__(
        self,
        name: str,
        description: str,
        args_schema: Dict[str, Any],
        run: Callable[[Dict[str, Any]], str],
        arun: Optional[Callable[[Dict[str, Any]], Awaitable[str]]] = None,
    ) -> None:
        self.name = name
        self.description = description
        self.args_schema = args_schema
        self._run = run
        self._arun = arun

    def run(self, *args: Any, **kwargs: Any) -> str:
        """Execute the tool.

        CrewAI calls tools with keyword arguments, but positional dict
        arguments are accepted too.
        """
        payload = _collect_args(args, kwargs)
        return self._run(payload)

    async def arun(self, *args: Any, **kwargs: Any) -> str:
        """Async execution, for crews running on an async executor."""
        if self._arun is None:
            return self.run(*args, **kwargs)
        return await self._arun(_collect_args(args, kwargs))

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ReachCrewTool(name={self.name!r})"


def _collect_args(args: tuple, kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize the different ways frameworks call a tool."""
    payload: Dict[str, Any] = {}
    for arg in args:
        if isinstance(arg, dict):
            payload.update(arg)
        else:
            payload["input"] = arg
    payload.update(kwargs)
    return payload


def ReachTool(  # noqa: N802 - factory named like the class users expect
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
) -> ReachCrewTool:
    """Create a CrewAI tool bound to a channel action.

    :param channel: Platform id, e.g. ``xiaohongshu``
    :param action: Action name, e.g. ``search``
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

    def run(args: Dict[str, Any]) -> str:
        result = client.execute(channel, action, coerce_params(channel, action, args))
        return result.text

    async def arun(args: Dict[str, Any]) -> str:
        result = await async_client.execute(
            channel, action, coerce_params(channel, action, args)
        )
        return result.text

    param_names = ", ".join(p.name for p in action_definition.params)
    return ReachCrewTool(
        name=name or f"{channel}_{action}",
        description=description
        or (
            f"[{definition.name}] {action_definition.description}. "
            f"Parameters: {param_names}."
        ),
        args_schema=schema,
        run=run,
        arun=arun,
    )


def ReachReadTool(  # noqa: N802
    name: Optional[str] = None,
    description: Optional[str] = None,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> ReachCrewTool:
    """Create a tool that reads any public URL, auto-detecting the platform."""
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

    def run(args: Dict[str, Any]) -> str:
        url = args.get("url") or args.get("target") or ""
        return client.read(str(url)).text

    async def arun(args: Dict[str, Any]) -> str:
        url = args.get("url") or args.get("target") or ""
        result = await async_client.read(str(url))
        return result.text

    return ReachCrewTool(
        name=name or "read_url",
        description=description
        or (
            "Read any public URL. The platform is detected automatically "
            "(GitHub, Bilibili, YouTube, Twitter, Reddit, Xiaohongshu, ...)."
        ),
        args_schema={
            "type": "object",
            "properties": {"url": {"type": "string", "description": "The URL to read"}},
            "required": ["url"],
        },
        run=run,
        arun=arun,
    )


def ReachChannelTools(  # noqa: N802
    channel: str,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> List[ReachCrewTool]:
    """Create one tool per action of a channel."""
    definition = get_channel(channel)
    if definition is None:
        raise ValueError(f"Unknown channel: {channel}")

    return [
        ReachTool(
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


def ReachTools(  # noqa: N802
    channels: List[Dict[str, Any]],
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> List[ReachCrewTool]:
    """Create tools for several channels at once.

    Each entry is ``{"channel": ..., "action": ...}``. Omitting ``action``
    produces one tool per action of that channel.
    """
    tools: List[ReachCrewTool] = []

    for entry in channels:
        channel = entry["channel"]
        action = entry.get("action")
        if action:
            tools.append(
                ReachTool(
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
            tools.extend(
                ReachChannelTools(
                    channel,
                    mode=mode,
                    base_url=base_url,
                    bin_path=bin_path,
                    timeout_ms=timeout_ms,
                    headers=headers,
                )
            )

    return tools
