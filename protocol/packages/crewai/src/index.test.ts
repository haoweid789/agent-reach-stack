/**
 * Tests for the CrewAI adapter.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ReachTool, ReachReadTool, ReachChannelTools, ReachTools } from './index.js';
import type { ReachTransport, ReachParams } from '@agent-reach/sdk';

function recordingTransport(): {
  transport: ReachTransport;
  calls: Array<{ channel: string; action: string; params: ReachParams }>;
} {
  const calls: Array<{ channel: string; action: string; params: ReachParams }> = [];

  const transport: ReachTransport = {
    name: 'stub',
    async execute(channel, action, params = {}) {
      calls.push({ channel, action, params });
      return { ok: true, items: [{ title: 'T', url: 'u', text: 'body' }] };
    },
    async read() {
      return { ok: true, items: [{ title: 'Read', url: 'https://x', text: 'content' }] };
    },
    async listChannels() {
      return { ok: true };
    },
  };

  return { transport, calls };
}

test('ReachTool builds name, description and schema', () => {
  const { transport } = recordingTransport();

  const tool = ReachTool('github', 'search', { transport });

  assert.equal(tool.name, 'github_search');
  assert.match(tool.description, /GitHub/);
  assert.deepEqual(tool.args_schema.required, ['query']);
});

test('ReachTool rejects an unknown channel/action', () => {
  assert.throws(() => ReachTool('nope', 'search'), /Unknown Agent-Reach/);
});

test('ReachTool run returns formatted text', async () => {
  const { transport } = recordingTransport();

  const tool = ReachTool('github', 'search', { transport });
  const text = await tool.run({ query: 'hooks' });

  assert.match(text, /1\. T/);
});

test('ReachTool _run is an alias of run', async () => {
  const { transport } = recordingTransport();

  const tool = ReachTool('github', 'search', { transport });

  assert.equal(await tool._run({ query: 'x' }), await tool.run({ query: 'x' }));
});

test('ReachTool coerces string arguments', async () => {
  const { transport, calls } = recordingTransport();

  const tool = ReachTool('github', 'search', { transport });
  await tool.run({ query: 'hooks', limit: '4' });

  assert.equal(calls[0].params.limit, 4);
});

test('ReachReadTool requires a url', () => {
  const { transport } = recordingTransport();

  const tool = ReachReadTool({ transport });

  assert.deepEqual(tool.args_schema.required, ['url']);
  assert.equal(tool.name, 'read_url');
});

test('ReachChannelTools creates one tool per action', () => {
  const { transport } = recordingTransport();

  const tools = ReachChannelTools('github', { transport });

  assert.equal(tools.length, 2);
  assert.deepEqual(tools.map(t => t.name).sort(), ['github_read', 'github_search']);
});

test('ReachTools mixes explicit actions and whole channels', () => {
  const { transport } = recordingTransport();

  const tools = ReachTools(
    [
      { channel: 'github', action: 'search' },
      { channel: 'v2ex' },
    ],
    { transport }
  );

  assert.equal(tools.length, 1 + 4);
});
