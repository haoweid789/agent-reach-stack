/**
 * Tests for the A2A transport.
 *
 * The server is mocked at the fetch level, so these run without a live
 * agent-reach-a2a instance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { A2ATransport, buildPrompt, artifactsToItems, extractTask, } from './a2a-transport.js';
/** Build a fetch stub that returns canned JSON-RPC responses. */
function mockFetch(handler) {
    return (async (_url, init) => {
        const body = JSON.parse(init.body);
        const result = handler(body.method, body.params);
        return {
            ok: true,
            status: 200,
            json: async () => ({ jsonrpc: '2.0', id: body.id, result }),
        };
    });
}
// ============================================
// Prompt building
// ============================================
test('buildPrompt renders channel, action and params', () => {
    const prompt = buildPrompt('github', 'search', { query: 'react hooks', limit: 5 });
    assert.match(prompt, /^github search/);
    assert.match(prompt, /query "react hooks"/);
    assert.match(prompt, /limit "5"/);
});
test('buildPrompt skips empty params', () => {
    const prompt = buildPrompt('github', 'read', { target: 'a/b', extra: undefined });
    assert.ok(!prompt.includes('extra'));
});
// ============================================
// Task extraction
// ============================================
test('extractTask reads a bare task object (tasks/send shape)', () => {
    const task = extractTask({
        id: 'task-1',
        contextId: 'ctx-1',
        status: { state: 'WORKING' },
    });
    assert.equal(task?.id, 'task-1');
    assert.equal(task?.status.state, 'WORKING');
});
test('extractTask reads a wrapped task object (tasks/get shape)', () => {
    const task = extractTask({
        task: {
            id: 'task-2',
            contextId: 'ctx-2',
            status: { state: 'COMPLETED' },
        },
    });
    assert.equal(task?.id, 'task-2');
});
test('extractTask handles a taskId-only response', () => {
    const task = extractTask({ taskId: 'task-3', contextId: 'ctx-3' });
    assert.equal(task?.id, 'task-3');
    assert.equal(task?.status.state, 'WORKING');
});
test('extractTask returns undefined for an unrelated payload', () => {
    assert.equal(extractTask({ foo: 'bar' }), undefined);
    assert.equal(extractTask(null), undefined);
    assert.equal(extractTask('string'), undefined);
});
// ============================================
// Artifact conversion
// ============================================
test('artifactsToItems converts data parts into structured items', () => {
    const items = artifactsToItems([
        {
            artifactId: 'a1',
            name: 'Repo',
            parts: [
                {
                    type: 'data',
                    data: { title: 'Repo', url: 'https://github.com/a/b', text: 'desc', stars: 42 },
                },
            ],
        },
    ]);
    assert.equal(items?.length, 1);
    assert.equal(items?.[0].title, 'Repo');
    assert.equal(items?.[0].url, 'https://github.com/a/b');
    assert.deepEqual(items?.[0].raw, { title: 'Repo', url: 'https://github.com/a/b', text: 'desc', stars: 42 });
});
test('artifactsToItems converts text parts into items', () => {
    const items = artifactsToItems([
        { artifactId: 'a1', name: 'Result 1', parts: [{ type: 'text', text: 'some content' }] },
    ]);
    assert.equal(items?.length, 1);
    assert.equal(items?.[0].text, 'some content');
    assert.equal(items?.[0].title, 'Result 1');
});
test('artifactsToItems returns an empty array for no artifacts', () => {
    assert.deepEqual(artifactsToItems([]), []);
});
test('artifactsToItems prefers the data part over the text part', () => {
    const items = artifactsToItems([
        {
            artifactId: 'a1',
            name: 'Repo',
            parts: [
                { type: 'text', text: '**Repo**\nhttps://example.com' },
                {
                    type: 'data',
                    data: { title: 'Repo', url: 'https://example.com', text: 'body', author: 'me' },
                },
            ],
        },
    ]);
    assert.equal(items?.length, 1, 'should not produce one item per part');
    assert.equal(items?.[0].url, 'https://example.com');
    assert.equal(items?.[0].author, 'me');
    assert.equal(items?.[0].text, 'body');
});
test('artifactsToItems falls back to the text part when there is no data', () => {
    const items = artifactsToItems([
        { artifactId: 'a1', name: 'Result 1', parts: [{ type: 'text', text: 'plain' }] },
    ]);
    assert.equal(items?.length, 1);
    assert.equal(items?.[0].text, 'plain');
    assert.equal(items?.[0].title, 'Result 1');
});
// ============================================
// Transport behaviour
// ============================================
test('A2A transport polls until the task completes', async () => {
    let getCalls = 0;
    const transport = new A2ATransport({
        baseUrl: 'http://localhost:9999',
        fetchImpl: mockFetch((method) => {
            if (method === 'tasks/send') {
                return {
                    id: 'task-1',
                    contextId: 'ctx-1',
                    status: { state: 'WORKING' },
                };
            }
            getCalls += 1;
            if (getCalls < 2) {
                return {
                    task: {
                        id: 'task-1',
                        contextId: 'ctx-1',
                        status: { state: 'WORKING' },
                    },
                };
            }
            return {
                task: {
                    id: 'task-1',
                    contextId: 'ctx-1',
                    status: { state: 'COMPLETED' },
                    artifacts: [
                        {
                            artifactId: 'a1',
                            name: 'Result 1',
                            parts: [{ type: 'text', text: 'found it' }],
                        },
                    ],
                },
            };
        }),
    });
    const result = await transport.execute('github', 'search', { query: 'x' });
    assert.equal(result.ok, true);
    assert.equal(result.items?.length, 1);
    assert.equal(result.items?.[0].text, 'found it');
    assert.ok(getCalls >= 2, 'should have polled at least twice');
});
test('A2A transport reports a failed task as an error', async () => {
    const transport = new A2ATransport({
        baseUrl: 'http://localhost:9999',
        fetchImpl: mockFetch((method) => {
            if (method === 'tasks/send') {
                return { id: 'task-1', contextId: 'ctx-1', status: { state: 'WORKING' } };
            }
            return {
                task: {
                    id: 'task-1',
                    contextId: 'ctx-1',
                    status: {
                        state: 'FAILED',
                        message: { parts: [{ type: 'text', text: 'backend exploded' }] },
                    },
                },
            };
        }),
    });
    const result = await transport.execute('github', 'search', { query: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'TASK_FAILED');
    assert.match(result.error?.message ?? '', /backend exploded/);
});
test('A2A transport surfaces a missing task id', async () => {
    const transport = new A2ATransport({
        baseUrl: 'http://localhost:9999',
        fetchImpl: mockFetch(() => ({ unexpected: true })),
    });
    const result = await transport.execute('github', 'search', { query: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, 'BAD_RESPONSE');
});
test('A2A transport sends a structured invocation in the message metadata', async () => {
    let sentParams = null;
    const transport = new A2ATransport({
        baseUrl: 'http://localhost:9999',
        fetchImpl: (async (_url, init) => {
            const body = JSON.parse(init.body);
            if (body.method === 'tasks/send') {
                sentParams = body.params;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        jsonrpc: '2.0',
                        id: body.id,
                        result: { id: 'task-1', contextId: 'ctx-1', status: { state: 'COMPLETED' } },
                    }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        }),
    });
    await transport.execute('linkedin', 'jobs', { query: 'python', location: '深圳' });
    assert.deepEqual(sentParams.message.metadata.agentReach, {
        channel: 'linkedin',
        action: 'jobs',
        params: { query: 'python', location: '深圳' },
    });
});
//# sourceMappingURL=a2a-transport.test.js.map