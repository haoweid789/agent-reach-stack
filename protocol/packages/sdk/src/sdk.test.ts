/**
 * Tests for the SDK core: result normalization, schema building and the
 * client's parameter validation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCliOutput, normalizeResult } from './cli-transport.js';
import { buildActionSchema, coerceParams, formatResult } from './adapter-utils.js';
import { ReachClient } from './client.js';
import { CHANNEL_DEFINITIONS, getChannel, getAction, getAllToolNames } from './channels.js';
import type { ReachTransport, ReachResult, ReachParams } from './types.js';

// ============================================
// CLI output parsing
// ============================================

test('parseCliOutput parses a well-formed JSON payload', () => {
  const stdout = JSON.stringify({
    ok: true,
    items: [
      { title: 'React Hooks', url: 'https://github.com/a/b', text: 'A library' },
    ],
  });

  const result = parseCliOutput(stdout, '', 0);

  assert.equal(result.ok, true);
  assert.equal(result.items?.length, 1);
  assert.equal(result.items?.[0].title, 'React Hooks');
  assert.equal(result.items?.[0].url, 'https://github.com/a/b');
});

test('parseCliOutput finds JSON even when a warning precedes it', () => {
  const stdout = 'WARN: slow network\n{"ok": true, "items": [{"title": "T", "url": "u", "text": "x"}]}';

  const result = parseCliOutput(stdout, '', 0);

  assert.equal(result.ok, true);
  assert.equal(result.items?.length, 1);
});

test('parseCliOutput surfaces backend errors', () => {
  const stdout = JSON.stringify({
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'too many requests', retry_after_seconds: 30 },
  });

  const result = parseCliOutput(stdout, '', 1);

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'RATE_LIMITED');
  assert.equal(result.error?.retry_after_seconds, 30);
});

test('parseCliOutput reports empty output', () => {
  const result = parseCliOutput('', 'stderr text', 1);

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'EMPTY_OUTPUT');
  assert.equal(result.error?.hint, 'stderr text');
});

test('parseCliOutput wraps non-JSON output as a single item', () => {
  const result = parseCliOutput('plain text result', '', 0);

  assert.equal(result.ok, true);
  assert.equal(result.items?.length, 1);
  assert.equal(result.items?.[0].text, 'plain text result');
});

test('parseCliOutput handles malformed JSON without throwing', () => {
  const result = parseCliOutput('{not valid json', 'parse error', 1);

  // Falls back to text wrapping rather than crashing.
  assert.equal(result.ok, false);
  assert.equal(result.items?.[0].text, '{not valid json');
});

// ============================================
// Result normalization
// ============================================

test('normalizeResult fills in missing item fields', () => {
  const result = normalizeResult({ ok: true, items: [{ title: 'Only title' }] });

  assert.equal(result.items?.[0].title, 'Only title');
  assert.equal(result.items?.[0].url, '');
  assert.equal(result.items?.[0].text, '');
});

test('normalizeResult preserves raw payload', () => {
  const result = normalizeResult({
    ok: true,
    items: [{ title: 'T', url: 'u', text: 'x', raw: { stars: 42 } }],
  });

  assert.deepEqual(result.items?.[0].raw, { stars: 42 });
});

test('normalizeResult flips ok to false when an error is present', () => {
  const result = normalizeResult({
    ok: true,
    error: { code: 'X', message: 'boom' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'X');
});

// ============================================
// Channel catalog
// ============================================

test('catalog exposes all 14 channels', () => {
  assert.equal(CHANNEL_DEFINITIONS.length, 14);
});

test('every channel has at least one action', () => {
  for (const channel of CHANNEL_DEFINITIONS) {
    assert.ok(channel.actions.length > 0, `${channel.id} has no actions`);
  }
});

test('tool names are unique across the catalog', () => {
  const names = getAllToolNames();
  assert.equal(new Set(names).size, names.length);
});

test('getChannel and getAction resolve known entries', () => {
  assert.ok(getChannel('github'));
  assert.ok(getAction('github', 'search'));
  assert.equal(getChannel('nonexistent'), undefined);
  assert.equal(getAction('github', 'nonexistent'), undefined);
});

// ============================================
// Schema building
// ============================================

test('buildActionSchema marks required params and carries defaults', () => {
  const schema = buildActionSchema('github', 'search');

  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['query']);
  assert.equal(schema.properties.query.type, 'string');
  assert.equal(schema.properties.limit.default, 5);
});

test('buildActionSchema rejects unknown channel/action', () => {
  assert.throws(() => buildActionSchema('nope', 'search'), /Unknown channel\/action/);
});

// ============================================
// Parameter coercion
// ============================================

test('coerceParams converts numeric strings to numbers', () => {
  const params = coerceParams('github', 'search', { query: 'hooks', limit: '20' });

  assert.equal(params.query, 'hooks');
  assert.equal(params.limit, 20);
});

test('coerceParams drops undefined params not in the schema', () => {
  const params = coerceParams('github', 'search', { query: 'hooks', bogus: 'x' });

  assert.equal(params.bogus, undefined);
});

// ============================================
// Result formatting
// ============================================

test('formatResult renders items with title and url', () => {
  const result: ReachResult = {
    ok: true,
    items: [{ title: 'Repo', url: 'https://github.com/a/b', text: 'desc' }],
  };

  const text = formatResult(result);

  assert.match(text, /1\. Repo/);
  assert.match(text, /https:\/\/github\.com\/a\/b/);
});

test('formatResult renders errors with the hint', () => {
  const result: ReachResult = {
    ok: false,
    error: { code: 'RATE_LIMITED', message: 'too fast', hint: 'wait 30s' },
  };

  const text = formatResult(result);

  assert.match(text, /Error: too fast/);
  assert.match(text, /Hint: wait 30s/);
});

test('formatResult handles an empty result set', () => {
  assert.equal(formatResult({ ok: true, items: [] }), 'No results found.');
});

// ============================================
// Client validation (with a stub transport)
// ============================================

function stubTransport(result: ReachResult): ReachTransport {
  return {
    name: 'stub',
    async execute() {
      return result;
    },
    async read() {
      return result;
    },
    async listChannels() {
      return result;
    },
  };
}

test('client rejects an unknown channel before calling the transport', async () => {
  const client = new ReachClient({ transport: stubTransport({ ok: true }) });

  const result = await client.execute('nonexistent', 'search', { query: 'x' });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'UNKNOWN_CHANNEL');
});

test('client rejects an unknown action before calling the transport', async () => {
  const client = new ReachClient({ transport: stubTransport({ ok: true }) });

  const result = await client.execute('github', 'nonexistent', {});

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'UNKNOWN_ACTION');
});

test('client rejects a missing required parameter', async () => {
  const client = new ReachClient({ transport: stubTransport({ ok: true }) });

  const result = await client.execute('github', 'search', {});

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'MISSING_PARAM');
  assert.match(result.error?.message ?? '', /query/);
});

test('client forwards only known params to the transport', async () => {
  let received: Record<string, unknown> = {};

  const client = new ReachClient({
    transport: {
      name: 'stub',
      async execute(_channel, _action, params: ReachParams = {}) {
        received = params as Record<string, unknown>;
        return { ok: true };
      },
      async read() {
        return { ok: true };
      },
      async listChannels() {
        return { ok: true };
      },
    },
  });

  await client.execute('github', 'search', { query: 'hooks', limit: 3, bogus: 'x' });

  assert.deepEqual(received, { query: 'hooks', limit: 3 });
});

test('client validates the URL for read()', async () => {
  const client = new ReachClient({ transport: stubTransport({ ok: true }) });

  const result = await client.read('not-a-url');

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, 'INVALID_URL');
});
