/**
 * Agent-Reach A2A Transport
 *
 * Talks to a running `agent-reach-a2a` server over JSON-RPC 2.0 / HTTP.
 * Use this when the Agent-Reach instance lives on another machine or behind
 * a service boundary - the CLI transport is the local-only counterpart.
 */
import type { ReachTransport, ReachResult, ReachCallOptions, ReachParams } from './types.js';
import { normalizeResult } from './cli-transport.js';
/** Options for the A2A transport. */
export interface A2ATransportOptions {
    /** Base URL of the A2A server, e.g. `http://localhost:8080`. */
    baseUrl?: string;
    /** Request timeout in milliseconds. */
    timeoutMs?: number;
    /** Injectable fetch, for testing or custom agents. */
    fetchImpl?: typeof fetch;
    /** Extra headers, e.g. an auth token. */
    headers?: Record<string, string>;
}
interface A2ATask {
    id: string;
    contextId: string;
    status: {
        state: string;
        message?: {
            parts?: Array<{
                type: string;
                text?: string;
            }>;
        };
    };
    artifacts?: Array<{
        artifactId: string;
        name?: string;
        parts: Array<{
            type: string;
            text?: string;
            data?: Record<string, unknown>;
        }>;
    }>;
}
/**
 * Transport backed by the Agent-Reach A2A server.
 */
export declare class A2ATransport implements ReachTransport {
    readonly name = "a2a";
    readonly baseUrl: string;
    private readonly timeoutMs;
    private readonly fetchImpl;
    private readonly headers;
    private requestId;
    constructor(options?: A2ATransportOptions);
    execute(channel: string, action: string, params?: ReachParams, options?: ReachCallOptions): Promise<ReachResult>;
    read(url: string, options?: ReachCallOptions): Promise<ReachResult>;
    listChannels(): Promise<ReachResult>;
    /** Check whether the server is reachable and healthy. */
    health(): Promise<boolean>;
    /**
     * Send a prompt as a task and wait for it to settle.
     *
     * The server returns a task in SUBMITTED state and finishes it in the
     * background, so the result is polled until it reaches a terminal state.
     */
    private send;
    /** Issue a single JSON-RPC call. */
    private rpc;
}
/**
 * Extract the task object from an A2A response.
 *
 * The server wraps the task in `{ task: ... }` for `tasks/get`, but returns
 * it bare for `tasks/send`. Both shapes are accepted so the client works
 * against either server implementation.
 */
export declare function extractTask(payload: unknown): A2ATask | undefined;
/**
 * Render a channel action as the natural-language prompt the A2A server
 * parses. Quoted values survive the server's intent parser.
 */
export declare function buildPrompt(channel: string, action: string, params: ReachParams): string;
/**
 * Convert A2A artifacts back into SDK items.
 *
 * An artifact may carry a text rendering, a structured data part, or both.
 * When both are present the structured data wins, because it preserves the
 * individual fields instead of a flattened string.
 */
export declare function artifactsToItems(artifacts: Array<{
    artifactId: string;
    name?: string;
    parts: Array<{
        type: string;
        text?: string;
        data?: Record<string, unknown>;
    }>;
}>): ReachResult['items'];
/** Re-export for convenience. */
export { normalizeResult };
//# sourceMappingURL=a2a-transport.d.ts.map