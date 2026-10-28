"""AgentMesh adapter for Agent-Reach.

Example::

    from agent_reach.adapters.agentmesh import ReachHarness

    harness = ReachHarness("github", "search")
    report = harness.run({"query": "react hooks"})

AgentMesh harnesses wrap an agent loop with feedback and self-iteration.
This adapter exposes the Agent-Reach call as a harness step: the harness
runs the retrieval, turns the result into a structured observation, and
reports whether the goal is satisfied so an outer loop can decide whether
to iterate again.

``agentmesh`` is an optional extra - this module never imports it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..channels import get_action, get_channel
from ..client import AsyncReachClient, ReachClient
from ._base import build_action_schema, coerce_params

__all__ = [
    "ReachHarness",
    "HarnessReport",
    "HarnessStep",
]


@dataclass
class HarnessStep:
    """One iteration of a harness run."""

    index: int
    observation: str
    items: List[Dict[str, Any]] = field(default_factory=list)
    success: bool = True
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "observation": self.observation,
            "items": self.items,
            "success": self.success,
            "error": self.error,
        }


@dataclass
class HarnessReport:
    """The outcome of a harness run."""

    goal_met: bool
    steps: List[HarnessStep] = field(default_factory=list)
    observation: str = ""
    items: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "goal_met": self.goal_met,
            "observation": self.observation,
            "items": self.items,
            "steps": [step.to_dict() for step in self.steps],
        }


class ReachHarness:
    """An AgentMesh harness step backed by an Agent-Reach channel action.

    ``run`` executes the action once and reports the observation. The
    ``goal_met`` flag is set when the retrieval produced any items, which
    lets an outer self-iteration loop decide whether to try again.
    """

    def __init__(
        self,
        channel: str,
        action: str,
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
        self.description = f"[{definition.name}] {action_definition.description}"
        self.schema = build_action_schema(channel, action)

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

    def run(self, params: Optional[Dict[str, Any]] = None) -> HarnessReport:
        """Execute the action and return a harness report."""
        result = self._client.execute(
            self.channel,
            self.action,
            coerce_params(self.channel, self.action, params or {}),
        )

        if not result.ok:
            error = result.error
            message = error.message if error else "unknown error"
            return HarnessReport(
                goal_met=False,
                steps=[
                    HarnessStep(
                        index=0,
                        observation=f"Error: {message}",
                        success=False,
                        error=message,
                    )
                ],
                observation=f"Error: {message}",
            )

        items = [item.to_dict() for item in result.items]
        observation = result.text
        goal_met = bool(items)

        return HarnessReport(
            goal_met=goal_met,
            steps=[
                HarnessStep(
                    index=0,
                    observation=observation,
                    items=items,
                    success=True,
                )
            ],
            observation=observation,
            items=items,
        )

    async def arun(self, params: Optional[Dict[str, Any]] = None) -> HarnessReport:
        """Async variant of :meth:`run`."""
        result = await self._async_client.execute(
            self.channel,
            self.action,
            coerce_params(self.channel, self.action, params or {}),
        )

        if not result.ok:
            error = result.error
            message = error.message if error else "unknown error"
            return HarnessReport(
                goal_met=False,
                steps=[
                    HarnessStep(
                        index=0,
                        observation=f"Error: {message}",
                        success=False,
                        error=message,
                    )
                ],
                observation=f"Error: {message}",
            )

        items = [item.to_dict() for item in result.items]
        return HarnessReport(
            goal_met=bool(items),
            steps=[
                HarnessStep(
                    index=0,
                    observation=result.text,
                    items=items,
                    success=True,
                )
            ],
            observation=result.text,
            items=items,
        )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"ReachHarness(channel={self.channel!r}, action={self.action!r})"
