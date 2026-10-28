"""Shared helpers for the framework adapters.

The adapters deliberately avoid importing their target framework. Each
framework's tool/function shape is a plain object, so typing them
structurally keeps the adapters dependency-free and immune to framework
version drift - the framework is an optional extra.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from ..channels import CHANNEL_DEFINITIONS, get_action, get_channel
from ..types import CallOptions, ReachParams

__all__ = [
    "build_action_schema",
    "coerce_params",
    "list_channel_ids",
    "SchemaProperty",
]

# A JSON Schema object describing one parameter.
SchemaProperty = Dict[str, Any]


def list_channel_ids() -> List[str]:
    """Every known channel id."""
    return [channel.id for channel in CHANNEL_DEFINITIONS]


def build_action_schema(
    channel: str,
    action: str,
    include_defaults: bool = True,
) -> Dict[str, Any]:
    """Build a JSON Schema object for a channel action.

    :param channel: Platform id
    :param action: Action name
    :param include_defaults: Carry the catalog defaults into the schema
    :raises ValueError: If the channel or action is unknown
    """
    definition = get_channel(channel)
    action_definition = get_action(channel, action)

    if definition is None or action_definition is None:
        raise ValueError(
            f"Unknown channel/action: {channel}/{action}. "
            f"Known channels: {', '.join(list_channel_ids())}"
        )

    properties: Dict[str, SchemaProperty] = {}
    required: List[str] = []

    for param in action_definition.params:
        prop: SchemaProperty = {
            "type": param.type,
            "description": param.description,
        }
        if include_defaults and param.default is not None:
            prop["default"] = param.default
        properties[param.name] = prop

        if param.required:
            required.append(param.name)

    return {"type": "object", "properties": properties, "required": required}


def coerce_params(
    channel: str,
    action: str,
    args: Dict[str, Any],
) -> ReachParams:
    """Coerce loosely-typed arguments into the types the catalog declares.

    Frameworks often hand over everything as strings, and some use
    ``float`` for integers. Values that cannot be coerced are dropped
    rather than passed through unvalidated.
    """
    action_definition = get_action(channel, action)
    params: ReachParams = {}

    if action_definition is None:
        return params

    for param in action_definition.params:
        value = args.get(param.name)
        if value is None:
            continue

        if param.type == "number":
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            # Keep integers integral so the CLI receives "5" and not "5.0".
            params[param.name] = int(number) if number.is_integer() else number
        elif param.type == "boolean":
            if isinstance(value, bool):
                params[param.name] = value
            else:
                params[param.name] = str(value).lower() in ("true", "1", "yes")
        else:
            params[param.name] = str(value)

    return params
