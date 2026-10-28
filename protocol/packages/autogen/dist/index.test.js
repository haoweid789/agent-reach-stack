/**
 * Tests for the AutoGen adapter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ReachFunction, ReachReadFunction, ReachChannelFunctions, ReachFunctions, } from './index.js';
function recordingTransport() {
    const calls = [];
    const transport = {
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
test('ReachFunction builds name, description and parameters', () => {
    const { transport } = recordingTransport();
    const fn = ReachFunction('bilibili', 'read', { transport });
    assert.equal(fn.name, 'bilibili_read');
    assert.match(fn.description, /Bilibili/);
    assert.deepEqual(fn.parameters.required, ['target']);
});
test('ReachFunction rejects an unknown channel/action', () => {
    assert.throws(() => ReachFunction('nope', 'read'), /Unknown Agent-Reach/);
});
test('ReachFunction execute returns formatted text', async () => {
    const { transport } = recordingTransport();
    const fn = ReachFunction('bilibili', 'read', { transport });
    const text = await fn.execute({ target: 'BV1' });
    assert.match(text, /1\. T/);
});
test('ReachFunction execute coerces arguments', async () => {
    const { transport, calls } = recordingTransport();
    const fn = ReachFunction('github', 'search', { transport });
    await fn.execute({ query: 'hooks', limit: '5' });
    assert.equal(calls[0].params.limit, 5);
});
test('ReachReadFunction requires a url', () => {
    const { transport } = recordingTransport();
    const fn = ReachReadFunction({ transport });
    assert.deepEqual(fn.parameters.required, ['url']);
});
test('ReachChannelFunctions creates one function per action', () => {
    const { transport } = recordingTransport();
    const fns = ReachChannelFunctions('github', { transport });
    assert.equal(fns.length, 2);
});
test('ReachFunctions mixes explicit actions and whole channels', () => {
    const { transport } = recordingTransport();
    const fns = ReachFunctions([
        { channel: 'github', action: 'search' },
        { channel: 'v2ex' },
    ], { transport });
    assert.equal(fns.length, 1 + 4);
});
//# sourceMappingURL=index.test.js.map