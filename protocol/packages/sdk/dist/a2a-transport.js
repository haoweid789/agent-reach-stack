/**
 * Agent-Reach A2A Transport
 *
 * Talks to a running `agent-reach-a2a` server over JSON-RPC 2.0 / HTTP.
 * Use this when the Agent-Reach instance lives on another machine or behind
 * a service boundary - the CLI transport is the local-only counterpart.
 */
import { ReachError } from './types.js';
import { normalizeResult } from './cli-transport.js';
/**
 * Transport backed by the Agent-Reach A2A server.
 */
export class A2ATransport {
    name = 'a2a';
    baseUrl;
    timeoutMs;
    fetchImpl;
    headers;
    requestId = 0;
    constructor(options = {}) {
        this.baseUrl = (options.baseUrl ?? 'http://localhost:8080').replace(/\/+$/, '');
        this.timeoutMs = options.timeoutMs ?? 120_000;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.headers = options.headers ?? {};
    }
    async execute(channel, action, params = {}, options = {}) {
        // Structured invocation: the server uses these values verbatim instead of
        // parsing natural language, which keeps multi-parameter actions lossless.
        const prompt = buildPrompt(channel, action, params);
        return this.send(prompt, options, { channel, action, params });
    }
    async read(url, options = {}) {
        return this.send(url, options);
    }
    async listChannels() {
        try {
            const response = await this.fetchImpl(`${this.baseUrl}/.well-known/agent.json`, {
                headers: this.headers,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (!response.ok) {
                return {
                    ok: false,
                    error: {
                        code: 'HTTP_ERROR',
                        message: `Agent Card request failed with HTTP ${response.status}`,
                    },
                };
            }
            const card = (await response.json());
            return {
                ok: true,
                items: (card.skills ?? []).map(skill => ({
                    title: skill.name ?? skill.id,
                    url: '',
                    text: skill.description ?? '',
                })),
                meta: card,
            };
        }
        catch (error) {
            return {
                ok: false,
                error: {
                    code: 'REQUEST_FAILED',
                    message: `Failed to reach A2A server at ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
                    hint: 'Is `agent-reach-a2a` running?',
                },
            };
        }
    }
    /** Check whether the server is reachable and healthy. */
    async health() {
        try {
            const response = await this.fetchImpl(`${this.baseUrl}/health`, {
                headers: this.headers,
                signal: AbortSignal.timeout(5_000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Send a prompt as a task and wait for it to settle.
     *
     * The server returns a task in SUBMITTED state and finishes it in the
     * background, so the result is polled until it reaches a terminal state.
     */
    async send(prompt, options, structured) {
        const timeoutMs = options.timeoutMs ?? this.timeoutMs;
        const deadline = Date.now() + timeoutMs;
        let task;
        try {
            const sendResult = await this.rpc('tasks/send', {
                message: {
                    role: 'user',
                    parts: [{ type: 'text', text: prompt }],
                    ...(structured
                        ? { metadata: { agentReach: structured } }
                        : {}),
                },
            }, timeoutMs);
            const extracted = extractTask(sendResult);
            task = extracted;
            if (!extracted?.id) {
                return {
                    ok: false,
                    error: {
                        code: 'BAD_RESPONSE',
                        message: 'A2A server did not return a task id',
                    },
                };
            }
        }
        catch (error) {
            return {
                ok: false,
                error: {
                    code: 'REQUEST_FAILED',
                    message: ReachError.from(error).message,
                    hint: ReachError.from(error).hint,
                },
            };
        }
        // Poll until the task reaches a terminal state.
        while (Date.now() < deadline) {
            if (['COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'AUTH_REQUIRED'].includes(task.status.state)) {
                break;
            }
            await sleep(100);
            try {
                const getResult = await this.rpc('tasks/get', { id: task.id }, timeoutMs);
                const updated = extractTask(getResult);
                if (updated?.id) {
                    task = updated;
                }
            }
            catch (error) {
                return {
                    ok: false,
                    error: {
                        code: 'REQUEST_FAILED',
                        message: ReachError.from(error).message,
                    },
                };
            }
        }
        if (!['COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'AUTH_REQUIRED'].includes(task.status.state)) {
            return {
                ok: false,
                error: {
                    code: 'TIMEOUT',
                    message: `A2A task ${task.id} did not complete within ${timeoutMs}ms`,
                },
            };
        }
        if (task.status.state !== 'COMPLETED') {
            const message = task.status.message?.parts
                ?.map(part => part.text ?? '')
                .filter(Boolean)
                .join('\n');
            return {
                ok: false,
                error: {
                    code: 'TASK_FAILED',
                    message: message || `A2A task ended in state ${task.status.state}`,
                },
            };
        }
        return {
            ok: true,
            items: artifactsToItems(task.artifacts ?? []),
        };
    }
    /** Issue a single JSON-RPC call. */
    async rpc(method, params, timeoutMs) {
        this.requestId += 1;
        const envelope = {
            jsonrpc: '2.0',
            id: this.requestId,
            method,
            params,
        };
        let response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}/rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.headers,
                },
                body: JSON.stringify(envelope),
                signal: AbortSignal.timeout(timeoutMs),
            });
        }
        catch (error) {
            throw new ReachError({
                code: 'REQUEST_FAILED',
                message: `A2A request failed: ${error instanceof Error ? error.message : String(error)}`,
                hint: `Is the A2A server running at ${this.baseUrl}?`,
            });
        }
        if (!response.ok) {
            throw new ReachError({
                code: 'HTTP_ERROR',
                message: `A2A server returned HTTP ${response.status}`,
            });
        }
        const body = (await response.json());
        if (body.error) {
            throw new ReachError({
                code: `JSONRPC_${body.error.code}`,
                message: body.error.message,
            });
        }
        return body.result;
    }
}
/**
 * Extract the task object from an A2A response.
 *
 * The server wraps the task in `{ task: ... }` for `tasks/get`, but returns
 * it bare for `tasks/send`. Both shapes are accepted so the client works
 * against either server implementation.
 */
export function extractTask(payload) {
    if (!payload || typeof payload !== 'object') {
        return undefined;
    }
    const record = payload;
    if (record.task && typeof record.task === 'object') {
        return record.task;
    }
    // Bare task object.
    if (typeof record.id === 'string' && record.status && typeof record.status === 'object') {
        return record;
    }
    // Only an id was returned (returnImmediately mode).
    if (typeof record.taskId === 'string') {
        return {
            id: record.taskId,
            contextId: typeof record.contextId === 'string' ? record.contextId : '',
            status: { state: 'WORKING' },
        };
    }
    return undefined;
}
/**
 * Render a channel action as the natural-language prompt the A2A server
 * parses. Quoted values survive the server's intent parser.
 */
export function buildPrompt(channel, action, params) {
    const parts = [`${channel} ${action}`];
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '')
            continue;
        parts.push(`${key} "${String(value)}"`);
    }
    return parts.join(' ');
}
/**
 * Convert A2A artifacts back into SDK items.
 *
 * An artifact may carry a text rendering, a structured data part, or both.
 * When both are present the structured data wins, because it preserves the
 * individual fields instead of a flattened string.
 */
export function artifactsToItems(artifacts) {
    const items = [];
    for (const artifact of artifacts) {
        const dataPart = artifact.parts.find(part => part.type === 'data' && part.data);
        const textPart = artifact.parts.find(part => part.type === 'text' && part.text);
        if (dataPart?.data) {
            const data = dataPart.data;
            items.push({
                title: typeof data.title === 'string' ? data.title : (artifact.name ?? ''),
                url: typeof data.url === 'string' ? data.url : '',
                author: typeof data.author === 'string' && data.author ? data.author : undefined,
                published_at: typeof data.published_at === 'string' && data.published_at
                    ? data.published_at
                    : undefined,
                text: typeof data.text === 'string' ? data.text : '',
                raw: data,
            });
            continue;
        }
        if (textPart?.text) {
            items.push({
                title: artifact.name ?? '',
                url: '',
                text: textPart.text,
            });
        }
    }
    return items;
}
/** Re-export for convenience. */
export { normalizeResult };
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=a2a-transport.js.map