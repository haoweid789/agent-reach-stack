"""Framework adapters for Agent-Reach.

Each adapter is a thin wrapper over the SDK. The target framework is an
optional extra - the adapters never import it, so they work across
framework versions.

Available adapters:

- :mod:`agent_reach.adapters.langgraph` - ``create_reach_node``
- :mod:`agent_reach.adapters.crewai` - ``ReachTool``
- :mod:`agent_reach.adapters.autogen` - ``ReachFunction``
- :mod:`agent_reach.adapters.agentuniverse` - ``ReachComponent``
- :mod:`agent_reach.adapters.agentmesh` - ``ReachHarness``
"""

from __future__ import annotations

__all__ = [
    "agentmesh",
    "agentuniverse",
    "autogen",
    "crewai",
    "langgraph",
]
