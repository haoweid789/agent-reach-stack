# Agent-Reach Roadmap

Tracking the v1.6 → v2.0 architecture upgrade. Status reflects what is
implemented and verified in this repository.

## Summary

| Dimension | v1.6 | v2.0 target |
|-----------|------|-------------|
| Positioning | Standalone CLI + ZCode Skill | General-purpose infrastructure: MCP + A2A + plugin ecosystem |
| Protocols | Proprietary JSON-RPC (STDIO) | MCP (stdio/SSE) + A2A (HTTP/JSON-RPC + SSE) |
| Extensibility | 14 hardcoded platforms | Dynamic plugin system (npm distribution) |
| Interop | ZCode only | Claude Code / Cursor / VS Code / LangGraph / CrewAI / AutoGen / any agent |
| Deployment | Single machine | Distribution-ready (registry, routing, observability) |

## Phase status

### Phase 1 — MCP Server integration ✅

Exposes the 14 platforms as standard MCP tools, callable from any MCP client.

| Deliverable | Status |
|-------------|--------|
| `agent-reach-mcp` (stdio/SSE) | ✅ |
| 42 MCP tools (`github_search`, `bilibili_read`, `youtube_transcribe`, `xueqiu_quote`, `auto_read`, …) | ✅ |
| MCP resources (channels, capabilities, status) | ✅ |
| MCP prompts | ✅ |
| Zero-config setup for Claude Code / Cursor / VS Code / Continue.dev | ✅ |

### Phase 2 — A2A / ANP protocol support ✅

Standard A2A node supporting task delegation, capability discovery and
streaming updates.

| Deliverable | Status |
|-------------|--------|
| `agent-reach-a2a` HTTP server (port 8080) | ✅ |
| Agent Card at `/.well-known/agent.json` — 41 skills | ✅ |
| `tasks/send`, `tasks/get`, `tasks/cancel`, `tasks/subscribe`, `messages/send` | ✅ |
| Natural-language intent routing | ✅ |
| Standard Task + Artifacts responses | ✅ |
| SSE streaming at `/tasks/{id}/stream` | ✅ |

### Phase 3 — Plugin / extension system ✅

Third parties extend the platform set via npm packages, without touching core code.

| Deliverable | Status |
|-------------|--------|
| `@agent-reach/plugin-sdk` — TypeScript SDK | ✅ |
| `PluginManager` — install / load / execute / uninstall lifecycle | ✅ |
| `agent-reach-plugin` CLI (create / install / search / list / publish) | ✅ |
| Plugin scaffolding (`create zhihu --template=basic`) | ✅ |
| Plugins auto-register as MCP tools and A2A skills | ✅ |

### Phase 4 — TypeScript SDK + Python SDK + framework adapters ✅

Native adapters for mainstream agent frameworks, in both TypeScript and Python.

| Package | Framework | Entry point |
|---------|-----------|-------------|
| `@agent-reach/sdk` | Generic (TS) | `ReachClient` |
| `@agent-reach/langgraph` | LangGraph (TS) | `createReachNode` / `createReachTool` |
| `@agent-reach/crewai` | CrewAI (TS) | `ReachTool` |
| `@agent-reach/autogen` | AutoGen / AG2 (TS) | `ReachFunction` |
| `agent-reach-sdk` | Generic (Python) | `ReachClient` / `AsyncReachClient` |
| `agent_reach.adapters.langgraph` | LangGraph (Python) | `create_reach_node` / `create_reach_async_node` |
| `agent_reach.adapters.crewai` | CrewAI (Python) | `ReachTool` |
| `agent_reach.adapters.autogen` | AutoGen / AG2 (Python) | `ReachFunction` |
| `agent_reach.adapters.agentuniverse` | agentUniverse (Python) | `ReachComponent` |
| `agent_reach.adapters.agentmesh` | AgentMesh (Python) | `ReachHarness` |

Design notes:

- The SDK exposes two transports — a local CLI transport (spawns the
  `agent-reach` binary) and a remote A2A transport (JSON-RPC over HTTP) — so
  the same code works against a local install or a distributed deployment.
- The Python SDK ships a full async client alongside the sync one, because
  every mainstream Python agent framework (LangGraph, CrewAI, AutoGen) is
  async-first.
- Adapters never import their target framework. Each framework is an
  **optional dependency** and the tool/function shapes are declared
  structurally, which keeps the adapters free of version-coupling breakage.
- Channel validation happens in the SDK before any process is spawned or
  request is sent, so bad input fails fast and cheaply.
- Errors are returned as values (`ok` / `error.code` / `error.hint`), not
  raised, so both languages behave the same way.
- The A2A protocol gained a structured invocation channel
  (`message.metadata.agentReach`). The natural-language intent parser can
  only recover the first string parameter, so this is the lossless path for
  actions like `linkedin_jobs` (query + location).
- 62 TypeScript unit tests, 50 Python unit tests, plus end-to-end smoke
  tests in both languages that exercise the real CLI and a live A2A server.

### Phase 5 — Agent registry / discovery + multi-agent coordination ⏳

Production-grade distributed deployment. Not started.

| Component | Function | Tech options |
|-----------|----------|--------------|
| `agent-reach registry` | Service registration / discovery, health checks, heartbeats | etcd / Consul / Redis |
| Load balancing & routing | Locality-aware routing, circuit breaking, weighted distribution | Client-side or server-side |
| Coordination orchestration | Parallel fetching across instances, dedup and merge | `agent-reach coordinate` |
| Observability | Prometheus metrics, OpenTelemetry tracing, Grafana dashboard | Production-grade |
| Multi-tenancy | Team/project quotas, auth and authorization | API key + RBAC |

## Commercialization path

| Stage | Monetization | Notes |
|-------|--------------|-------|
| Now | Free and open source | Build the ecosystem, grow the user base |
| After Phase 4 | Plugin marketplace revenue share | Community publishes paid plugins, platform takes 15–30% |
| After Phase 5 | Enterprise registry | Private deployment, audit logs, SSO, SLA |
| Long term | Hosted cloud service | Serverless Agent-Reach, billed by call volume |

## Release checklist

Publishing the packages to npm requires an authenticated npm account:

```bash
npm login

# Publish in dependency order - the adapters depend on the SDK
npm publish --workspace @agent-reach/sdk --access public
npm publish --workspace @agent-reach/langgraph --access public
npm publish --workspace @agent-reach/crewai --access public
npm publish --workspace @agent-reach/autogen --access public
npm publish --access public   # the server package
```

The `@agent-reach` scope is owned by the upstream Agent-Reach project. If it
is not available, publish under a personal scope and update the `repository`
and `homepage` fields accordingly.

### PyPI

```bash
cd python/agent_reach_sdk
pip install build twine
python -m build
twine upload dist/*
```

The package name `agent-reach-sdk` should be checked against PyPI first; if
taken, use `agent-reach` or a personal prefix and update the metadata in
`pyproject.toml`.
