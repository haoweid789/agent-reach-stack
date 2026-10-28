/**
 * Tests for the framework adapters.
 *
 * A stub transport is injected so the adapters can be verified without
 * spawning the CLI or running a server.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createReachNode, createReachTool } from './index.js';
import type { ReachTransport, ReachResult, ReachParams } from '@agent-reach/sdk';

/** Transport that records what it was called with. */
function recordingTransport(
  result: ReachResult = { ok: true, items: [{ title: 'T', url: 'u', text: 'body' }] }
): { transport: ReachTransport; calls: Array<{ channel: string; action: string; params: ReachParams }> } {
  const calls: Array<{ channel: string; action: string; params: ReachParams }> = [];

  const transport: ReachTransport = {
    name: 'stub',
    async execute(channel, action, params = {}) {
      calls.push({ channel, action, params });
      return result;
    },
    async read() {
      return result;
    },
    async listChannels() {
      return result;
    },
  };

  return { transport, calls };
}

// ============================================
// Node creation
// ============================================

test('createReachNode rejects an unknown channel at build time', () => {
  assert.throws(() => createReachNode('nope', 'search'), /Unknown Agent-Reach channel/);
});

test('createReachNode rejects an unknown action at build time', () => {
  assert.throws(() => createReachNode('github', 'nope'), /Unknown Agent-Reach action/);
});

test('createReachNode writes the formatted result into the state', async () => {
  const { transport } = recordingTransport();

  const node = createReachNode('github', 'search', { query: 'hooks' }, { transport });

  const result = await node({});

  assert.equal(typeof result.reach, 'string');
  assert.match(result.reach as string, /1\. T/);
});

test('createReachNode merges static params with dynamic state params', async () => {
  const { transport, calls } = recordingTransport();

  const node = createReachNode('github', 'search', { query: 'static' }, { transport });

  await node({ reachArgs: { query: 'dynamic', limit: 3 } });

  assert.equal(calls[0].params.query, 'static');
  assert.equal(calls[0].params.limit, 3);
});

test('createReachNode honors a custom output key', async () => {
  const { transport } = recordingTransport();

  const node = createReachNode('github', 'search', { query: 'x' }, {
    transport,
    outputKey: 'findings',
  });

  const result = await node({});

  assert.ok(result.findings);
  assert.equal(result.reach, undefined);
});

test('createReachNode surfaces errors as formatted text', async () => {
  const { transport } = recordingTransport({
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'too fast', hint: 'wait' },
  });

  const node = createReachNode('github', 'search', { query: 'x' }, { transport });

  const result = await node({});

  assert.match(result.reach as string, /Error: too fast/);
});

test('createReachNode coerces numeric strings from state', async () => {
  const { transport, calls } = recordingTransport();

  const node = createReachNode('github', 'search', { query: 'x' }, { transport });

  await node({ reachArgs: { limit: '7' } });

  assert.equal(calls[0].params.limit, 7);
});

// ============================================
// Tool creation
// ============================================

test('createReachTool builds a schema with the right name', () => {
  const { transport } = recordingTransport();

  const tool = createReachTool('github', 'search', { transport });

  assert.equal(tool.name, 'github_search');
  assert.deepEqual(tool.schema.required, ['query']);
});

test('createReachTool func returns formatted text', async () => {
  const { transport } = recordingTransport();

  const tool = createReachTool('github', 'search', { transport });
  const text = await tool.func({ query: 'hooks' });

  assert.match(text, /1\. T/);
});

test('createReachTool func coerces arguments', async () => {
  const { transport, calls } = recordingTransport();

  const tool = createReachTool('github', 'search', { transport });
  await tool.func({ query: 'hooks', limit: '9' });

  assert.equal(calls[0].params.limit, 9);
});
