# agent-reach-sdk

Python SDK for [Agent-Reach](https://github.com/Panniantong/Agent-Reach) — one client for 14 platform channels, with pluggable transports.

Mirrors the TypeScript SDK (`@agent-reach/sdk`) so both languages behave identically.

## Install

```bash
pip install agent-reach-sdk
```

Requires the `agent-reach` CLI (for the CLI transport) or a running `agent-reach-a2a` server (for the A2A transport).

## Usage

```python
from agent_reach import ReachClient

reach = ReachClient()

result = reach.execute("github", "search", {"query": "react hooks", "limit": 5})

for item in result.items:
    print(item.title, item.url)
```

### Async

Every mainstream Python agent framework is async-first, so there is a full async client:

```python
import asyncio
from agent_reach import AsyncReachClient

async def main():
    reach = AsyncReachClient()
    result = await reach.execute("github", "search", {"query": "react hooks"})
    print(result.text)

asyncio.run(main())
```

### Convenience helpers

```python
await reach.search("xiaohongshu", "深圳 咖啡店")

# Read any URL - the platform is detected automatically
await reach.read("https://github.com/Panniantong/Agent-Reach")

# Inspect the catalog
from agent_reach import CHANNEL_DEFINITIONS
print(len(CHANNEL_DEFINITIONS))  # 14
```

## Transports

### CLI (default)

Spawns the `agent-reach` binary directly. Fastest path for local use.

```python
reach = ReachClient(mode="cli")
```

The executable is resolved at runtime: `AGENT_REACH_BIN` environment variable → `PATH` → well-known install locations (`~/.local/bin`, `~/.cargo/bin`, ...).

### A2A

Talks to a running `agent-reach-a2a` server over JSON-RPC 2.0 / HTTP. Use it when Agent-Reach runs on another machine or behind a service boundary.

```python
reach = ReachClient(mode="a2a", base_url="http://localhost:8080")
```

## Error handling

Errors are values, not exceptions:

```python
result = await reach.execute("github", "search", {"query": "x"})

if not result.ok:
    print(result.error.code)    # e.g. RATE_LIMITED
    print(result.error.message)
    print(result.error.hint)
```

Validation happens locally before any subprocess is spawned or request is sent:

```python
await reach.execute("nonexistent", "search", {})
# error.code == "UNKNOWN_CHANNEL"
```

## Framework adapters

Each adapter is a thin wrapper over the SDK. The target framework is an **optional extra** — the adapters never import it, so they work across framework versions.

```bash
pip install "agent-reach-sdk[langgraph]"   # or crewai / autogen / agentuniverse / agentmesh
```

### LangGraph

```python
from agent_reach.adapters.langgraph import create_reach_node, create_reach_async_node

# Sync node
node = create_reach_node("github", "search")
result = node({"reachArgs": {"query": "react hooks", "limit": 5}})
print(result["reach"])

# Async node
anode = create_reach_async_node("github", "search")
result = await anode({"reachArgs": {"query": "react hooks"}})
```

The node reads arguments from `state["reachArgs"]` and writes to `state["reach"]` — both keys are configurable via `input_key` / `output_key`.

### CrewAI

```python
from agent_reach.adapters.crewai import ReachTool

agent = Agent(
    role="小红书研究员",
    goal="找到深圳值得去的咖啡店",
    tools=[ReachTool("xiaohongshu", "search")],
)
```

### AutoGen / AG2

```python
from agent_reach.adapters.autogen import ReachFunction

assistant = ConversableAgent(
    name="researcher",
    functions=[ReachFunction("bilibili", "read")],
)
```

### agentUniverse

```python
from agent_reach.adapters.agentuniverse import ReachComponent

component = ReachComponent("github", "search")
profile = component.profile.to_dict()   # agentUniverse component profile
items = component.execute(query="react hooks")
```

### AgentMesh

```python
from agent_reach.adapters.agentmesh import ReachHarness

harness = ReachHarness("github", "search")
report = harness.run({"query": "react hooks"})
print(report.goal_met, report.items)
```

## Custom transport

Implement the transport protocol to plug in your own backend:

```python
from agent_reach import ReachClient, ReachResult, ReachItem

class MyTransport:
    name = "my-backend"

    def execute(self, channel, action, params=None, options=None):
        return ReachResult(ok=True, items=[ReachItem(title="T", url="u", text="body")])

    def read(self, url, options=None):
        return ReachResult(ok=True, items=[])

    def list_channels(self, options=None):
        return ReachResult(ok=True, items=[])

reach = ReachClient(transport=MyTransport())
```

Adapters accept the same injection point via `transport=`.

## Development

```bash
pip install -e ".[dev]"

pytest              # unit tests
python tests/smoke.py   # end-to-end: real CLI + live A2A server
```

## License

MIT
