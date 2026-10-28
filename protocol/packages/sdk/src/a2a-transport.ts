/**
 * Agent-Reach A2A Transport
 *
 * Talks to a running `agent-reach-a2a` server over JSON-RPC 2.0 / HTTP.
 * Use this when the Agent-Reach instance lives on another machine or behind
 * a service boundary - the CLI transport is the local-only counterpart.
 */

import type {
  ReachTransport,
  ReachResult,
  ReachCallOptions,
  ReachParams,
} from './types.js';
import { ReachError } from './types.js';
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

interface JSONRPCEnvelope {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

interface JSONRPCResponseEnvelope {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface A2ATask {
  id: string;
  contextId: string;
  status: {
    state: string;
    message?: { parts?: Array<{ type: string; text?: string }> };
  };
  artifacts?: Array<{
    artifactId: string;
    name?: string;
    parts: Array<{ type: string; text?: string; data?: Record<string, unknown> }>;
  }>;
}

/**
 * Transport backed by the Agent-Reach A2A server.
 */
export class A2ATransport implements ReachTransport {
  readonly name = 'a2a';

  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;
  private requestId = 0;

  constructor(options: A2ATransportOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:8080').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.headers = options.headers ?? {};
  }

  async execute(
    channel: string,
    action: string,
    params: ReachParams = {},
    options: ReachCallOptions = {}
  ): Promise<ReachResult> {
    // Structured invocation: the server uses these values verbatim instead of
    // parsing natural language, which keeps multi-parameter actions lossless.
    const prompt = buildPrompt(channel, action, params);
    return this.send(prompt, options, { channel, action, params });
  }

  async read(url: string, options: ReachCallOptions = {}): Promise<ReachResult> {
    return this.send(url, options);
  }

  async listChannels(): Promise<ReachResult> {
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

      const card = (await response.json()) as {
        skills?: Array<{ id: string; name?: string; description?: string }>;
      };

      return {
        ok: true,
        items: (card.skills ?? []).map(skill => ({
          title: skill.name ?? skill.id,
          url: '',
          text: skill.description ?? '',
        })),
        meta: card as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'REQUEST_FAILED',
          message: `Failed to reach A2A server at ${this.baseUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          hint: 'Is `agent-reach-a2a` running?',
        },
      };
    }
  }

  /** Check whether the server is reachable and healthy. */
  async health(): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send a prompt as a task and wait for it to settle.
   *
   * The server returns a task in SUBMITTED state and finishes it in the
   * background, so the result is polled until it reaches a terminal state.
   */
  private async send(
    prompt: string,
    options: ReachCallOptions,
    structured?: { channel: string; action: string; params: ReachParams }
  ): Promise<ReachResult> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const deadline = Date.now() + timeoutMs;

    let task: A2ATask;
    try {
      const sendResult = await this.rpc(
        'tasks/send',
        {
          message: {
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
            ...(structured
              ? { metadata: { agentReach: structured } }
              : {}),
          },
        },
        timeoutMs
      );

      const extracted = extractTask(sendResult);
      task = extracted as A2ATask;

      if (!extracted?.id) {
        return {
          ok: false,
          error: {
            code: 'BAD_RESPONSE',
            message: 'A2A server did not return a task id',
          },
        };
      }
    } catch (error) {
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
      } catch (error) {
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
  private async rpc(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    this.requestId += 1;

    const envelope: JSONRPCEnvelope = {
      jsonrpc: '2.0',
      id: this.requestId,
      method,
      params,
    };

    let response: Response;
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
    } catch (error) {
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

    const body = (await response.json()) as JSONRPCResponseEnvelope;

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
export function extractTask(payload: unknown): A2ATask | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  if (record.task && typeof record.task === 'object') {
    return record.task as A2ATask;
  }

  // Bare task object.
  if (typeof record.id === 'string' && record.status && typeof record.status === 'object') {
    return record as unknown as A2ATask;
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
export function buildPrompt(channel: string, action: string, params: ReachParams): string {
  const parts: string[] = [`${channel} ${action}`];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
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
export function artifactsToItems(
  artifacts: Array<{
    artifactId: string;
    name?: string;
    parts: Array<{ type: string; text?: string; data?: Record<string, unknown> }>;
  }>
): ReachResult['items'] {
  const items: NonNullable<ReachResult['items']> = [];

  for (const artifact of artifacts) {
    const dataPart = artifact.parts.find(part => part.type === 'data' && part.data);
    const textPart = artifact.parts.find(part => part.type === 'text' && part.text);

    if (dataPart?.data) {
      const data = dataPart.data;
      items.push({
        title: typeof data.title === 'string' ? data.title : (artifact.name ?? ''),
        url: typeof data.url === 'string' ? data.url : '',
        author: typeof data.author === 'string' && data.author ? data.author : undefined,
        published_at:
          typeof data.published_at === 'string' && data.published_at
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
