# @agent-reach/sdk

TypeScript SDK for [Agent-Reach](https://github.com/Panniantong/Agent-Reach) — one client for 14 platform channels, with pluggable transports.

## Install

```bash
npm install @agent-reach/sdk
```

Requires the `agent-reach` CLI (for the CLI transport) or a running `agent-reach-a2a` server (for the A2A transport).

## Usage

```ts
import { ReachClient } from '@agent-reach/sdk';

const reach = new ReachClient();

// Execute a channel action
const result = await reach.execute('github', 'search', { query: 'react hooks', limit: 5 });

for (const item of result.items ?? []) {
  console.log(item.title, item.url);
}
```

### Convenience helpers

```ts
// Search a channel
await reach.search('xiaohongshu', '深圳 咖啡店');

// Read any URL - the platform is detected automatically
await reach.read('https://github.com/Panniantong/Agent-Reach');

// Inspect the catalog
const channels = ReachClient.channels; // 14 channels, 40 actions
ReachClient.getChannel('github');
```

## Transports

### CLI (default)

Spawns the `agent-reach` binary directly. Fastest path for local use.

```ts
const reach = new ReachClient({ mode: 'cli' });
```

The executable is resolved at runtime, in this order:
1. `AGENT_REACH_BIN` environment variable
2. `agent-reach` on `PATH`
3. Well-known install locations (`~/.local/bin`, `~/.cargo/bin`, ...)

### A2A

Talks to a running `agent-reach-a2a` server over JSON-RPC 2.0 / HTTP. Use it when Agent-Reach runs on another machine or behind a service boundary.

```ts
const reach = new ReachClient({
  mode: 'a2a',
  baseUrl: 'http://localhost:8080',
});
```

## Error handling

Every call returns a `ReachResult`. Errors are values, not exceptions:

```ts
const result = await reach.execute('github', 'search', { query: 'x' });

if (!result.ok) {
  console.error(result.error?.code);    // e.g. RATE_LIMITED
  console.error(result.error?.message);
  console.error(result.error?.hint);
}
```

Validation happens locally before any process is spawned or request is sent, so unknown channels and missing parameters fail fast:

```ts
await reach.execute('nonexistent', 'search', {});
// { ok: false, error: { code: 'UNKNOWN_CHANNEL', ... } }
```

## Custom transport

Implement the `ReachTransport` interface to plug in your own backend:

```ts
import type { ReachTransport } from '@agent-reach/sdk';

const myTransport: ReachTransport = {
  name: 'my-backend',
  async execute(channel, action, params) { return { ok: true, items: [] }; },
  async read(url) { return { ok: true, items: [] }; },
  async listChannels() { return { ok: true, items: [] }; },
};

const reach = new ReachClient({ transport: myTransport });
```

## License

MIT
