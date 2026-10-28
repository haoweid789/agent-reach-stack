"""Tests for the Python framework adapters."""

from __future__ import annotations

import pytest

from agent_reach import ReachItem, ReachResult
from agent_reach.adapters._base import build_action_schema, coerce_params
from agent_reach.adapters.agentmesh import ReachHarness
from agent_reach.adapters.agentuniverse import ReachComponent
from agent_reach.adapters.autogen import ReachFunction, ReachReadFunction
from agent_reach.adapters.crewai import ReachChannelTools, ReachReadTool, ReachTool, ReachTools
from agent_reach.adapters.langgraph import create_reach_node, create_reach_read_node, create_reach_tool


class StubTransport:
    name = "stub"

    def __init__(self, result: ReachResult | None = None):
        # Note: a failed ReachResult is falsy (its __bool__ returns ok), so
        # this must be an explicit None check rather than `result or ...`.
        if result is None:
            result = ReachResult(
                ok=True, items=[ReachItem(title="T", url="u", text="body")]
            )
        self.result = result
        self.calls: list[tuple[str, str, dict]] = []

    def execute(self, channel, action, params=None, options=None):
        self.calls.append((channel, action, params or {}))
        return self.result

    def read(self, url, options=None):
        self.calls.append(("read", url, {}))
        return self.result

    def list_channels(self, options=None):
        return self.result


# ===========================================================================
# Schema and coercion helpers
# ============================================


def test_build_action_schema_marks_required_and_carries_defaults():
    schema = build_action_schema("github", "search")

    assert schema["type"] == "object"
    assert schema["required"] == ["query"]
    assert schema["properties"]["query"]["type"] == "string"
    assert schema["properties"]["limit"]["default"] == 5


def test_build_action_schema_rejects_unknown_channel():
    with pytest.raises(ValueError, match="Unknown channel/action"):
        build_action_schema("nope", "search")


def test_coerce_params_converts_numeric_strings():
    params = coerce_params("github", "search", {"query": "hooks", "limit": "20"})

    assert params["query"] == "hooks"
    assert params["limit"] == 20


def test_coerce_params_keeps_integers_integral():
    params = coerce_params("github", "search", {"query": "x", "limit": "5.0"})

    assert params["limit"] == 5
    assert isinstance(params["limit"], int)


def test_coerce_params_drops_unknown_and_uncoercible_values():
    params = coerce_params("github", "search", {"query": "x", "bogus": "y", "limit": "abc"})

    assert "bogus" not in params
    assert "limit" not in params


# ============================================
# LangGraph
# ============================================


def test_langgraph_node_writes_formatted_result():
    transport = StubTransport()

    node = create_reach_node("github", "search", {"query": "hooks"}, transport=transport)

    result = node({})

    assert "1. T" in result["reach"]


def test_langgraph_node_rejects_unknown_channel():
    with pytest.raises(ValueError, match="Unknown channel/action"):
        create_reach_node("nope", "search")


def test_langgraph_node_merges_static_and_dynamic_params():
    transport = StubTransport()

    node = create_reach_node("github", "search", {"query": "static"}, transport=transport)

    node({"reachArgs": {"query": "dynamic", "limit": 3}})

    assert transport.calls[0][2]["query"] == "static"
    assert transport.calls[0][2]["limit"] == 3


def test_langgraph_node_honors_custom_output_key():
    transport = StubTransport()

    node = create_reach_node("github", "search", {"query": "x"}, output_key="findings", transport=transport)

    result = node({})

    assert "findings" in result
    assert "reach" not in result


def test_langgraph_node_surfaces_errors():
    from agent_reach import ReachError

    transport = StubTransport(
        ReachResult(
            ok=False,
            error=ReachError(code="RATE_LIMITED", message="too fast", hint="wait").to_payload(),
        )
    )

    node = create_reach_node("github", "search", {"query": "x"}, transport=transport)

    assert "Error: too fast" in node({})["reach"]


def test_langgraph_read_node_requires_a_url():
    transport = StubTransport()

    node = create_reach_read_node(transport=transport)

    assert "no URL provided" in node({})["reach"]


def test_langgraph_read_node_reads_the_url():
    transport = StubTransport()

    node = create_reach_read_node(transport=transport)

    node({"url": "https://github.com/a/b"})

    assert transport.calls[0][0] == "read"


def test_langgraph_tool_builds_schema_and_runs():
    transport = StubTransport()

    tool = create_reach_tool("github", "search", transport=transport)

    assert tool.name == "github_search"
    assert tool.schema["required"] == ["query"]
    assert "1. T" in tool.func({"query": "hooks"})


# ============================================
# CrewAI
# ============================================


def test_crewai_tool_builds_name_description_and_schema():
    transport = StubTransport()

    tool = ReachTool("github", "search", transport=transport)

    assert tool.name == "github_search"
    assert "GitHub" in tool.description
    assert tool.args_schema["required"] == ["query"]


def test_crewai_tool_rejects_unknown_channel():
    with pytest.raises(ValueError, match="Unknown channel/action"):
        ReachTool("nope", "search")


def test_crewai_tool_run_returns_text():
    transport = StubTransport()

    tool = ReachTool("github", "search", transport=transport)

    assert "1. T" in tool.run({"query": "hooks"})


def test_crewai_tool_accepts_kwargs():
    transport = StubTransport()

    tool = ReachTool("github", "search", transport=transport)
    tool.run(query="hooks")

    assert transport.calls[0][2]["query"] == "hooks"


def test_crewai_read_tool_requires_url():
    transport = StubTransport()

    tool = ReachReadTool(transport=transport)

    assert tool.args_schema["required"] == ["url"]


def test_crewai_channel_tools_creates_one_per_action():
    transport = StubTransport()

    tools = ReachChannelTools("github", transport=transport)

    assert len(tools) == 2
    assert sorted(t.name for t in tools) == ["github_read", "github_search"]


def test_crewai_tools_mixes_actions_and_channels():
    transport = StubTransport()

    tools = ReachTools([{"channel": "github", "action": "search"}, {"channel": "v2ex"}], transport=transport)

    assert len(tools) == 1 + 4


# ============================================
# AutoGen
# ============================================


def test_autogen_function_builds_parameters():
    transport = StubTransport()

    fn = ReachFunction("bilibili", "read", transport=transport)

    assert fn.name == "bilibili_read"
    assert "Bilibili" in fn.description
    assert fn.parameters["required"] == ["target"]


def test_autogen_function_execute_returns_text():
    transport = StubTransport()

    fn = ReachFunction("bilibili", "read", transport=transport)

    assert "1. T" in fn.execute({"target": "BV1"})


def test_autogen_read_function_requires_url():
    transport = StubTransport()

    fn = ReachReadFunction(transport=transport)

    assert fn.parameters["required"] == ["url"]


# ============================================
# agentUniverse
# ============================================


def test_agentuniverse_component_builds_a_profile():
    transport = StubTransport()

    component = ReachComponent("github", "search", transport=transport)

    profile = component.profile.to_dict()

    assert profile["component_type"] == "agent_reach"
    assert profile["name"] == "agent_reach_github_search"
    assert profile["pattern"]["parameters"]["required"] == ["query"]


def test_agentuniverse_component_executes():
    transport = StubTransport()

    component = ReachComponent("github", "search", transport=transport)

    items = component.execute(query="hooks")

    assert len(items) == 1
    assert items[0]["title"] == "T"


# ============================================
# AgentMesh
# ============================================


def test_agentmesh_harness_reports_goal_met():
    transport = StubTransport()

    harness = ReachHarness("github", "search", transport=transport)

    report = harness.run({"query": "hooks"})

    assert report.goal_met
    assert len(report.items) == 1
    assert len(report.steps) == 1
    assert report.steps[0].success


def test_agentmesh_harness_reports_failure():
    from agent_reach import ReachError

    transport = StubTransport(
        ReachResult(
            ok=False,
            error=ReachError(code="X", message="boom").to_payload(),
        )
    )

    harness = ReachHarness("github", "search", transport=transport)

    report = harness.run({"query": "hooks"})

    assert not report.goal_met
    assert not report.steps[0].success
    assert "boom" in report.observation
