"""agent-reach - Python SDK for the Agent-Reach multi-platform retrieval engine.

One client for 14 platform channels, with pluggable transports:

- ``cli`` (default) - spawns the ``agent-reach`` binary locally
- ``a2a`` - talks to a running ``agent-reach-a2a`` server over JSON-RPC

Example::

    from agent_reach import ReachClient

    reach = ReachClient()
    result = reach.execute("github", "search", {"query": "react hooks"})
    for item in result.items:
        print(item.title, item.url)

Async usage (for LangGraph / CrewAI / AutoGen)::

    from agent_reach import AsyncReachClient

    reach = AsyncReachClient()
    result = await reach.execute("github", "search", {"query": "react hooks"})
"""

from __future__ import annotations

from ._format import format_items, format_result
from .a2a_transport import (
    A2ATransport,
    AsyncA2ATransport,
    artifacts_to_items,
    build_prompt,
    extract_task,
)
from .channels import (
    CHANNEL_DEFINITIONS,
    ActionParam,
    ChannelAction,
    ChannelDefinition,
    get_action,
    get_all_tool_names,
    get_channel,
)
from .cli_transport import (
    AsyncCliTransport,
    CliTransport,
    normalize_result,
    parse_cli_output,
    resolve_agent_reach_bin,
)
from .client import (
    AsyncReachClient,
    ReachClient,
    create_async_reach,
    create_reach,
)
from .types import (
    AsyncReachTransport,
    CallOptions,
    ReachError,
    ReachErrorPayload,
    ReachItem,
    ReachParams,
    ReachResult,
    ReachTransport,
)

__version__ = "1.0.0"

__all__ = [
    "__version__",
    # Clients
    "ReachClient",
    "AsyncReachClient",
    "create_reach",
    "create_async_reach",
    # Transports
    "CliTransport",
    "AsyncCliTransport",
    "A2ATransport",
    "AsyncA2ATransport",
    "ReachTransport",
    "AsyncReachTransport",
    # Types
    "ReachResult",
    "ReachItem",
    "ReachError",
    "ReachErrorPayload",
    "ReachParams",
    "CallOptions",
    # Catalog
    "CHANNEL_DEFINITIONS",
    "ChannelDefinition",
    "ChannelAction",
    "ActionParam",
    "get_channel",
    "get_action",
    "get_all_tool_names",
    # Helpers
    "format_result",
    "format_items",
    "parse_cli_output",
    "normalize_result",
    "resolve_agent_reach_bin",
    "build_prompt",
    "artifacts_to_items",
    "extract_task",
]
