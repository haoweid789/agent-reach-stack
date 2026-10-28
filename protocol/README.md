# Agent-Reach MCP/A2A/Plugin Server

**One package, three protocols, 14+ platforms, infinite extensibility.**

> **定位**：[Agent-Reach](https://github.com/Panniantong/Agent-Reach) 的**协议层适配器** —— 让 AI 客户端和 Agent 框架直接调用它的 42 个工具。
>
> **不是**：抓取引擎本体，也不改 Agent-Reach 内部的抓取后端。
>
> **本仓库（agent-reach-stack）的一部分**：本目录是协议层（"谁在调用"）。Firecrawl 抓取后端（"用什么抓"）位于仓库的 `backend/`，用 `python install.py` 一次装好两层。

Exposes [Agent-Reach](https://github.com/Panniantong/Agent-Reach) as:
- 🔌 **MCP Server** - Works with Claude Code, Cursor, VS Code, Continue.dev
- 🤝 **A2A Server** - Agent-to-Agent protocol for multi-agent delegation
- 🧩 **Plugin System** - Build custom platform plugins via npm

## Features

| Protocol | Use Case | Clients |
|----------|----------|---------|
| **MCP** | Direct tool calling from AI assistants | Claude Code, Cursor, VS Code, Continue.dev, Windsurf |
| **A2A** | Agent delegation & orchestration | LangGraph, CrewAI, AutoGen, custom agents |
| **Plugin** | Extend with custom platforms | npm packages, community sharing |

## Supported Platforms (Built-in)

| Platform | Channel | Actions |
|----------|---------|---------|
| GitHub | `github` | `search`, `read` |
| Bilibili | `bilibili` | `search`, `read`, `hot`, `subtitle` |
| YouTube | `youtube` | `search`, `read`, `subtitle`, `transcribe` |
| Twitter/X | `twitter` | `search`, `profile`, `tweets`, `thread` |
| Reddit | `reddit` | `search`, `read`, `subreddit` |
| Xiaohongshu | `xiaohongshu` | `search`, `read`, `comments` |
| V2EX | `v2ex` | `hot`, `node`, `read`, `user` |
| Xueqiu | `xueqiu` | `quote`, `search`, `hot_posts`, `hot_stocks` |
| Xiaoyuzhou | `xiaoyuzhou` | `transcribe` |
| LinkedIn | `linkedin` | `jobs`, `read` |
| BOSS Zhipin | `boss` | `search`, `read` |
| Instagram | `instagram` | `search`, `profile`, `posts` |
| Facebook | `facebook` | `search`, `profile` |
| Web (General) | `web` | `search`, `read` |

**Total: 42 MCP tools / 41 A2A skills** (40 channel actions + `auto_read`)

## Quick Start

### Prerequisites
- Node.js 20+
- [Agent-Reach CLI](https://github.com/Panniantong/Agent-Reach) installed

```bash
# Install Agent-Reach CLI (if not already)
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
agent-reach setup
```

### Install via Script (Recommended)

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/haoweid789/agent-reach-mcp/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://raw.githubusercontent.com/haoweid789/agent-reach-mcp/main/install.ps1 | iex"
```

### Manual Install

```bash
git clone https://github.com/haoweid789/agent-reach-mcp.git
cd agent-reach-mcp
npm install
npm run build
```

## Usage

### 1. MCP Server (for AI Assistants)

Start the server:
```bash
agent-reach-mcp
# or
node dist/index.js
```

Configure in your AI assistant:

**Claude Code / Cursor / VS Code / Continue.dev:**
```json
{
  "mcpServers": {
    "agent-reach": {
      "command": "node",
      "args": ["/path/to/agent-reach-mcp/dist/index.js"],
      "env": {
        "PATH": "/home/user/.local/bin:${PATH}"
      }
    }
  }
}
```

**Now you can ask:**
- "Search GitHub for React hooks libraries"
- "Get Bilibili video details: BV1TH9uBBEwa"
- "Read this GitHub issue: https://github.com/microsoft/TypeScript/issues/12345"
- "Search Xiaohongshu for coffee shop recommendations"
- "Get real-time stock quote for AAPL"

### 2. A2A Server (for Agent Delegation)

Start the server:
```bash
agent-reach-a2a
# or
node dist/a2a-server.js
```

**Endpoints:**
- Agent Card: `http://localhost:8080/.well-known/agent.json`
- JSON-RPC: `http://localhost:8080/rpc`
- SSE Streaming: `http://localhost:8080/tasks/{taskId}/stream`

**Example - Delegate from another agent:**
```python
import httpx

async def search_via_agent_reach(query: str):
    async with httpx.AsyncClient() as client:
        # 1. Send task
        resp = await client.post("http://localhost:8080/rpc", json={
            "jsonrpc": "2.0", "id": 1,
            "method": "tasks/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": query}]
                }
            }
        })
        task = resp.json()["result"]
        
        # 2. Get result (or use SSE for streaming)
        result = await client.post("http://localhost:8080/rpc", json={
            "jsonrpc": "2.0", "id": 2,
            "method": "tasks/get", "params": {"id": task["id"]}
        })
        return result.json()["result"]["task"]["artifacts"]
```

### 3. Plugin System (for Custom Platforms)

**Install a community plugin:**
```bash
agent-reach-plugin search zhihu
agent-reach-plugin install @agent-reach/plugin-zhihu
```

**Create your own plugin:**
```bash
agent-reach-plugin create zhihu --template=basic
cd @agent-reach/plugin-zhihu
npm install
# Edit src/index.ts to implement search/read logic
npm run build
npm publish --access public
```

**Plugin structure:**
```
@agent-reach/plugin-zhihu/
├── plugin.json          # Manifest (channel, actions, auth, etc.)
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts         # PluginModule with execute(action, params, context)
└── test/
    └── plugin.test.js
```

**Plugin SDK (`@agent-reach/plugin-sdk`):**
```typescript
import { PluginModule, PluginContext, createPluginResult, PluginHttpClient } from '@agent-reach/plugin-sdk';

const plugin: PluginModule = {
  manifest: { name: '@agent-reach/plugin-zhihu', channel: 'zhihu', ... },
  
  async execute(actionName, params, context) {
    const http = new PluginHttpClient({ baseUrl: 'https://api.zhihu.com' });
    const response = await http.get('/search', { params: { q: params.query } });
    return createPluginResult(response.data.items.map(item => ({
      title: item.title,
      url: item.url,
      author: item.author.name,
      published_at: item.created_time,
      text: item.excerpt,
    })));
  }
};

export default plugin;
```

## Architecture

This repository is an npm workspaces monorepo. The root package is the server;
the packages under `packages/` are the client-side SDKs and framework adapters.

```
agent-reach-mcp/
├── src/                         # @agent-reach/mcp-server
│   ├── index.ts                 # MCP Server (stdio/SSE)
│   ├── a2a-server.ts            # A2A Server (HTTP/JSON-RPC + SSE)
│   ├── plugin-manager.ts        # Plugin lifecycle (install/load/execute)
│   ├── plugin-cli.ts            # Plugin CLI (create/install/search/publish)
│   ├── plugin-sdk.ts            # SDK for plugin authors
│   ├── plugin-types.ts          # TypeScript types
│   ├── channel-definitions.ts   # Re-export of the SDK channel catalog
│   └── cli-wrapper.ts           # Spawns agent-reach CLI
├── packages/
│   ├── sdk/                     # @agent-reach/sdk
│   │   ├── src/client.ts        # ReachClient - the unified entry point
│   │   ├── src/cli-transport.ts # Local CLI transport
│   │   ├── src/a2a-transport.ts # Remote A2A transport
│   │   ├── src/channels.ts      # Canonical 14-channel catalog
│   │   └── src/adapter-utils.ts # Shared helpers for framework adapters
│   ├── langgraph/               # @agent-reach/langgraph
│   ├── crewai/                  # @agent-reach/crewai
│   └── autogen/                 # @agent-reach/autogen
├── python/
│   └── agent_reach_sdk/         # agent-reach-sdk (PyPI)
│       ├── agent_reach/         # Core client, dual transport
│       │   ├── client.py        # ReachClient / AsyncReachClient
│       │   ├── cli_transport.py
│       │   ├── a2a_transport.py
│       │   ├── channels.py      # Same catalog as the TS SDK
│       │   └── adapters/        # langgraph, crewai, autogen,
│       │                        # agentuniverse, agentmesh
│       └── tests/               # pytest + end-to-end smoke test
├── scripts/smoke.mjs            # End-to-end smoke test (Node)
├── dist/                        # Compiled output
├── install.sh                   # Linux/macOS installer
├── install.ps1                  # Windows installer
└── package.json                 # Workspace root
```

### Packages

| Package | Purpose |
|---------|---------|
| `@agent-reach/mcp-server` | MCP Server, A2A Server and Plugin System |
| `@agent-reach/sdk` | TypeScript client with CLI and A2A transports |
| `@agent-reach/langgraph` | LangGraph nodes and tool specs |
| `@agent-reach/crewai` | CrewAI tools |
| `@agent-reach/autogen` | AutoGen / AG2 functions |
| `agent-reach-sdk` | Python client, same API and transports |

The channel catalog lives in `@agent-reach/sdk` and is re-exported by the
server. The Python SDK carries a generated copy of the same catalog, so both
languages expose exactly the same tool set.

## TypeScript SDK

```bash
npm install @agent-reach/sdk
```

```ts
import { ReachClient } from '@agent-reach/sdk';

const reach = new ReachClient();

// Local CLI transport (default)
const result = await reach.execute('github', 'search', { query: 'react hooks', limit: 5 });
for (const item of result.items ?? []) {
  console.log(item.title, item.url);
}

// Remote A2A transport
const remote = new ReachClient({ mode: 'a2a', baseUrl: 'http://localhost:8080' });

// Read any URL - the platform is detected automatically
await reach.read('https://github.com/Panniantong/Agent-Reach');
```

Errors are returned as values, not thrown:

```ts
const result = await reach.execute('github', 'search', {});
if (!result.ok) {
  console.error(result.error?.code);    // UNKNOWN_CHANNEL / MISSING_PARAM / ...
}
```

## Framework adapters

Each adapter is a thin wrapper over the SDK. The target framework is an
**optional peer dependency** — the adapters never import it, so they work
across framework versions.

### LangGraph

```ts
import { createReachNode } from '@agent-reach/langgraph';

const node = createReachNode('github', 'search');
const { reach } = await node({ reachArgs: { query: 'react hooks' } });
```

### CrewAI

```ts
import { ReachTool } from '@agent-reach/crewai';

const agent = new Agent({
  role: 'Researcher',
  goal: 'Find coffee shops',
  tools: [ReachTool('xiaohongshu', 'search')],
});
```

### AutoGen / AG2

```ts
import { ReachFunction } from '@agent-reach/autogen';

const assistant = new ConversableAgent({
  name: 'researcher',
  functions: [ReachFunction('bilibili', 'read')],
});
```

## Python SDK

The Python SDK mirrors the TypeScript one, including the transport model and
the error semantics. Every mainstream Python agent framework is async-first,
so it ships a full async client alongside the sync one.

```bash
pip install agent-reach-sdk
```

```python
from agent_reach import ReachClient

reach = ReachClient()
result = reach.execute("github", "search", {"query": "react hooks", "limit": 5})
for item in result.items:
    print(item.title, item.url)
```

```python
import asyncio
from agent_reach import AsyncReachClient

async def main():
    reach = AsyncReachClient()
    result = await reach.execute("github", "search", {"query": "react hooks"})
    print(result.text)

asyncio.run(main())
```

### Python framework adapters

| Adapter | Entry point |
|---------|-------------|
| `agent_reach.adapters.langgraph` | `create_reach_node` / `create_reach_async_node` / `create_reach_tool` |
| `agent_reach.adapters.crewai` | `ReachTool` / `ReachReadTool` / `ReachChannelTools` |
| `agent_reach.adapters.autogen` | `ReachFunction` / `ReachReadFunction` |
| `agent_reach.adapters.agentuniverse` | `ReachComponent` |
| `agent_reach.adapters.agentmesh` | `ReachHarness` |

```python
from agent_reach.adapters.langgraph import create_reach_node

node = create_reach_node("github", "search")
print(node({"reachArgs": {"query": "react hooks"}})["reach"])
```

The frameworks are optional extras (`pip install "agent-reach-sdk[langgraph]"`)
and are never imported by the adapters, so version drift cannot break them.

## Development

```bash
# Build everything (SDK, adapters, then the server)
npm run build

# Build a single package
npm run build --workspace @agent-reach/sdk

# Run all TypeScript tests
npm run test:packages

# End-to-end smoke test against the real CLI and a live A2A server
node scripts/smoke.mjs
```

### Python

```bash
cd python/agent_reach_sdk
pip install -e ".[dev]"

pytest                  # unit tests
python tests/smoke.py   # end-to-end: real CLI + live A2A server
```

## Configuration

### Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | A2A server port | `8080` |
| `HOST` | A2A server host | `0.0.0.0` |
| `BASE_URL` | Public base URL for Agent Card | `http://localhost:8080` |
| `AGENT_REACH_PLUGIN_BASE` | Base dir for plugin creation | `cwd` |

### Agent-Reach CLI
The server spawns `agent-reach` CLI. Ensure it's in PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Development

```bash
# Watch mode for MCP server
npm run dev

# Watch mode for A2A server
npm run dev:a2a

# Watch mode for Plugin CLI
npm run dev:plugin

# Run tests
npm test
```

## Publishing

```bash
# Build all
npm run build

# Publish MCP/A2A server
npm publish --access public

# Publish plugin SDK separately
cd plugin-sdk && npm publish --access public
```

## Extending with Plugins

1. **Create plugin:** `agent-reach-plugin create myplatform`
2. **Implement actions** in `src/index.ts` using `PluginHttpClient`, `PluginCache`, `PluginLogger`
3. **Build & test:** `npm run build && npm test`
4. **Publish:** `npm publish --access public`
5. **Users install:** `agent-reach-plugin install @agent-reach/plugin-myplatform`

Plugins automatically appear in:
- MCP tools (`myplatform_search`, `myplatform_read`, etc.)
- A2A skills (`myplatform_search`, `myplatform_read`, etc.)
- Plugin CLI (`agent-reach-plugin list`)

## License

MIT

## Credits

- [Agent-Reach](https://github.com/Panniantong/Agent-Reach) - The underlying multi-platform content retrieval engine
- [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- [A2A](https://a2a-protocol.org/) - Agent-to-Agent Protocol

## Related Projects

| Project | Layer | What it does |
|---------|-------|--------------|
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | Upstream | The engine this server wraps |
| [haoweid789/agent-reach-firecrawl](https://github.com/haoweid789/agent-reach-firecrawl) | Backend | Patches Firecrawl into Agent-Reach's `web` channel (read / search / map) |