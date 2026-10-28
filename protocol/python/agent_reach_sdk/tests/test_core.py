"""Tests for the Python SDK core."""

from __future__ import annotations

import pytest

from agent_reach import (
    CHANNEL_DEFINITIONS,
    ReachClient,
    ReachError,
    ReachItem,
    ReachResult,
    format_result,
    get_action,
    get_all_tool_names,
    get_channel,
    normalize_result,
    parse_cli_output,
)
from agent_reach.channels import ChannelDefinition
from agent_reach.types import CallOptions, ReachParams


# ============================================
# CLI output parsing
# ============================================


def test_parse_cli_output_parses_well_formed_json():
    stdout = (
        '{"ok": true, "items": '
        '[{"title": "React Hooks", "url": "https://github.com/a/b", "text": "A library"}]}'
    )

    result = parse_cli_output(stdout, "", 0)

    assert result.ok
    assert len(result.items) == 1
    assert result.items[0].title == "React Hooks"
    assert result.items[0].url == "https://github.com/a/b"


def test_parse_cli_output_finds_json_after_a_warning():
    stdout = 'WARN: slow network\n{"ok": true, "items": [{"title": "T", "url": "u", "text": "x"}]}'

    result = parse_cli_output(stdout, "", 0)

    assert result.ok
    assert len(result.items) == 1


def test_parse_cli_output_surfaces_backend_errors():
    stdout = (
        '{"ok": false, "error": {"code": "RATE_LIMITED", "message": "too many requests", '
        '"retry_after_seconds": 30}}'
    )

    result = parse_cli_output(stdout, "", 1)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "RATE_LIMITED"
    assert result.error.retry_after_seconds == 30


def test_parse_cli_output_reports_empty_output():
    result = parse_cli_output("", "stderr text", 1)

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "EMPTY_OUTPUT"
    assert result.error.hint == "stderr text"


def test_parse_cli_output_wraps_non_json_output():
    result = parse_cli_output("plain text result", "", 0)

    assert result.ok
    assert len(result.items) == 1
    assert result.items[0].text == "plain text result"


def test_parse_cli_output_handles_malformed_json_without_raising():
    result = parse_cli_output("{not valid json", "parse error", 1)

    assert not result.ok
    assert result.items[0].text == "{not valid json"


# ============================================
# Result normalization
# ============================================


def test_normalize_result_fills_missing_item_fields():
    result = normalize_result({"ok": True, "items": [{"title": "Only title"}]})

    assert result.items[0].title == "Only title"
    assert result.items[0].url == ""
    assert result.items[0].text == ""


def test_normalize_result_preserves_raw_payload():
    result = normalize_result(
        {"ok": True, "items": [{"title": "T", "url": "u", "text": "x", "raw": {"stars": 42}}]}
    )

    assert result.items[0].raw == {"stars": 42}


def test_normalize_result_flips_ok_on_error():
    result = normalize_result({"ok": True, "error": {"code": "X", "message": "boom"}})

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "X"


# ============================================
# Channel catalog
# ============================================


def test_catalog_exposes_all_14_channels():
    assert len(CHANNEL_DEFINITIONS) == 14


def test_every_channel_has_at_least_one_action():
    for channel in CHANNEL_DEFINITIONS:
        assert channel.actions, f"{channel.id} has no actions"


def test_tool_names_are_unique():
    names = get_all_tool_names()
    assert len(set(names)) == len(names)


def test_get_channel_and_get_action_resolve_known_entries():
    assert get_channel("github") is not None
    assert get_action("github", "search") is not None
    assert get_channel("nonexistent") is None
    assert get_action("github", "nonexistent") is None


# ============================================
# Formatting
# ============================================


def test_format_result_renders_items():
    result = ReachResult(ok=True, items=[ReachItem(title="Repo", url="https://github.com/a/b", text="desc")])

    text = format_result(result)

    assert "1. Repo" in text
    assert "https://github.com/a/b" in text


def test_format_result_renders_errors_with_hint():
    result = ReachResult(
        ok=False,
        error=ReachError(code="RATE_LIMITED", message="too fast", hint="wait 30s").to_payload(),
    )

    text = format_result(result)

    assert "Error: too fast" in text
    assert "Hint: wait 30s" in text


def test_format_result_handles_empty_results():
    assert format_result(ReachResult(ok=True, items=[])) == "No results found."


# ============================================
# Client validation
# ============================================


class StubTransport:
    """Transport that records calls and returns a canned result."""

    name = "stub"

    def __init__(self, result: ReachResult | None = None):
        # A failed ReachResult is falsy, so this needs an explicit None check.
        if result is None:
            result = ReachResult(
                ok=True, items=[ReachItem(title="T", url="u", text="body")]
            )
        self.result = result
        self.calls: list[tuple[str, str, ReachParams]] = []

    def execute(self, channel, action, params=None, options=None):
        self.calls.append((channel, action, params or {}))
        return self.result

    def read(self, url, options=None):
        self.calls.append(("read", url, {}))
        return self.result

    def list_channels(self, options=None):
        return self.result


def test_client_rejects_unknown_channel():
    client = ReachClient(transport=StubTransport())

    result = client.execute("nonexistent", "search", {"query": "x"})

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "UNKNOWN_CHANNEL"


def test_client_rejects_unknown_action():
    client = ReachClient(transport=StubTransport())

    result = client.execute("github", "nonexistent", {})

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "UNKNOWN_ACTION"


def test_client_rejects_missing_required_param():
    client = ReachClient(transport=StubTransport())

    result = client.execute("github", "search", {})

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "MISSING_PARAM"
    assert "query" in result.error.message


def test_client_forwards_only_known_params():
    transport = StubTransport()
    client = ReachClient(transport=transport)

    client.execute("github", "search", {"query": "hooks", "limit": 3, "bogus": "x"})

    assert transport.calls[0][2] == {"query": "hooks", "limit": 3}


def test_client_validates_read_url():
    client = ReachClient(transport=StubTransport())

    result = client.read("not-a-url")

    assert not result.ok
    assert result.error is not None
    assert result.error.code == "INVALID_URL"


def test_client_search_helper_adds_query():
    transport = StubTransport()
    client = ReachClient(transport=transport)

    client.search("github", "react hooks")

    assert transport.calls[0][2]["query"] == "react hooks"


def test_client_channels_returns_the_catalog():
    channels = ReachClient.channels()

    assert len(channels) == 14
    assert channels[0]["id"] == "github"
    assert "actions" in channels[0]
