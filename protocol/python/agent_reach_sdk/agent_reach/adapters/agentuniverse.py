"""agentUniverse adapter for Agent-Reach.

Example::

    from agent_reach.adapters.agentuniverse import ReachComponent

    component = ReachComponent("github", "search")

agentUniverse is a Python-first framework built around the Pattern Factory
pattern. A component is described by a YAML/JSON profile plus a Python
class, so this adapter produces the profile dict and an execute method
that agentUniverse can call.

``agentuniverse`` is an optional extra - this module never imports it.
"""

from __future__ import annotations

import inspect
from typing import Any, Awaitable, Callable, Dict, List, Optional

from ..channels import get_action, get_channel
from ..client import AsyncReachClient, ReachClient
from ._base import build_action_schema, coerce_params

__all__ = [
    "ReachComponent",
    "ReachComponentProfile",
    "ReachComponents",
]


class ReachComponentProfile:
    """The agentUniverse component profile for a channel action.

    agentUniverse describes components with a profile containing a
    ``component_type`` and a ``pattern`` of parameters and results. This
    class renders that structure so it can be dropped straight into an
    agentUniverse configuration.
    """

    def __init__(
        self,
        channel: str,
        action: str,
        component_name: str,
        description: str,
        parameters: Dict[str, Any],
        results: Dict[str, Any],
    ) -> None:
        self.channel = channel
        self.action = action
        self.component_name = component_name
        self.description = description
        self.parameters = parameters
        self.results = results

    def to_dict(self) -> Dict[str, Any]:
        """Render the profile as a plain dict."""
        return {
            "component_type": "agent_reach",
            "name": self.component_name,
            "description": self.description,
            "pattern": {
                "parameters": self.parameters,
                "results": self.results,
            },
            "metadata": {
                "channel": self.channel,
                "action": self.action,
            },
        }

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ReachComponentProfile(name={self.component_name!r})"


class ReachComponent:
    """An agentUniverse component bound to a channel action.

    The component exposes an ``execute`` method, matching the call
    convention agentUniverse components use.
    """

    def __init__(
        self,
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
    ) -> None:
        definition = get_channel(channel)
        action_definition = get_action(channel, action)
        if definition is None or action_definition is None:
            raise ValueError(f"Unknown channel/action: {channel}/{action}")

        self.channel = channel
        self.action = action

        schema = build_action_schema(channel, action)
        self.schema = schema

        self.profile = ReachComponentProfile(
            channel=channel,
            action=action,
            component_name=name or f"agent_reach_{channel}_{action}",
            description=description
            or f"[{definition.name}] {action_definition.description}",
            parameters=schema,
            results={
                "type": "list",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "author": {"type": "string"},
                        "published_at": {"type": "string"},
                        "text": {"type": "string"},
                    },
                },
            },
        )

        self._client = ReachClient(
            transport=transport,
            mode=mode,
            base_url=base_url,
            bin_path=bin_path,
            timeout_ms=timeout_ms,
            headers=headers,
        )
        self._async_client = AsyncReachClient(
            transport=transport,
            mode=mode,
            base_url=base_url,
            bin_path=bin_path,
            timeout_ms=timeout_ms,
            headers=headers,
        )

    @property
    def name(self) -> str:
        return self.profile.component_name

    @property
    def description(self) -> str:
        return self.profile.description

    def execute(self, **kwargs: Any) -> List[Dict[str, Any]]:
        """Run the action and return structured items."""
        result = self._client.execute(
            self.channel, self.action, coerce_params(self.channel, self.action, kwargs)
        )
        if not result.ok:
            return []
        return [item.to_dict() for item in result.items]

    async def aexecute(self, **kwargs: Any) -> List[Dict[str, Any]]:
        """Async variant of :meth:`execute`."""
        result = await self._async_client.execute(
            self.channel, self.action, coerce_params(self.channel, self.action, kwargs)
        )
        if not result.ok:
            return []
        return [item.to_dict() for item in result.items]

    def __call__(self, **kwargs: Any) -> List[Dict[str, Any]]:
        return self.execute(**kwargs)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ReachComponent(channel={self.channel!r}, action={self.action!r})"


def ReachComponents(  # noqa: N802
    channel: str,
    mode: str = "cli",
    base_url: Optional[str] = None,
    bin_path: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    headers: Optional[Dict[str, str]] = None,
    transport: Optional[Any] = None,
) -> List[ReachComponent]:
    """Create one component per action of a channel."""
    definition = get_channel(channel)
    if definition is None:
        raise ValueError(f"Unknown channel: {channel}")

    return [
        ReachComponent(
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
