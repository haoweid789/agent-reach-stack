/**
 * Agent-Reach SDK Client
 *
 * The single entry point for programmatic access to Agent-Reach.
 * Wraps a transport (CLI for local use, A2A for remote) and exposes a
 * small, stable API that framework adapters build on.
 */

import type {
  ReachTransport,
  ReachResult,
  ReachCallOptions,
  ReachParams,
  ChannelSummary,
} from './types.js';
import { ReachError } from './types.js';
import { CliTransport } from './cli-transport.js';
import { A2ATransport } from './a2a-transport.js';
import { CHANNEL_DEFINITIONS, getChannel, getAction } from './channels.js';

/** Options accepted by {@link ReachClient}. */
export interface ReachClientOptions {
  /** Explicit transport. Overrides `mode`. */
  transport?: ReachTransport;
  /**
   * Transport selection:
   * - `cli` (default) - spawn the agent-reach CLI locally
   * - `a2a` - talk to a running agent-reach-a2a server
   */
  mode?: 'cli' | 'a2a';
  /** Base URL for the A2A transport. */
  baseUrl?: string;
  /** Override the agent-reach executable. */
  binPath?: string;
  /** Default timeout in milliseconds. */
  timeoutMs?: number;
  /** Injectable fetch (A2A transport only). */
  fetchImpl?: typeof fetch;
  /** Extra HTTP headers (A2A transport only). */
  headers?: Record<string, string>;
}

/**
 * Unified client over the Agent-Reach platform catalog.
 *
 * ```ts
 * const reach = new ReachClient();
 * const result = await reach.execute('github', 'search', { query: 'react hooks' });
 * ```
 */
export class ReachClient {
  private readonly transport: ReachTransport;

  constructor(options: ReachClientOptions = {}) {
    this.transport = options.transport ?? createTransport(options);
  }

  /** The transport in use. */
  get transportName(): string {
    return this.transport.name;
  }

  /**
   * Execute a channel action.
   *
   * @param channel - Platform id, e.g. `github`, `bilibili`, `xiaohongshu`
   * @param action - Action name, e.g. `search`, `read`
   * @param params - Action parameters, validated against the catalog
   */
  async execute(
    channel: string,
    action: string,
    params: ReachParams = {},
    options: ReachCallOptions = {}
  ): Promise<ReachResult> {
    const definition = getChannel(channel);
    if (!definition) {
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_CHANNEL',
          message: `Unknown channel: ${channel}`,
          hint: `Available channels: ${CHANNEL_DEFINITIONS.map(c => c.id).join(', ')}`,
        },
      };
    }

    const actionDefinition = getAction(channel, action);
    if (!actionDefinition) {
      return {
        ok: false,
        error: {
          code: 'UNKNOWN_ACTION',
          message: `Unknown action: ${action} for channel ${channel}`,
          hint: `Available actions: ${definition.actions.map(a => a.name).join(', ')}`,
        },
      };
    }

    // Validate required parameters before hitting the transport.
    for (const param of actionDefinition.params) {
      if (param.required && (params[param.name] === undefined || params[param.name] === '')) {
        return {
          ok: false,
          error: {
            code: 'MISSING_PARAM',
            message: `Required parameter missing: ${param.name}`,
          },
        };
      }
    }

    // Drop parameters the action does not define.
    const filtered: ReachParams = {};
    for (const param of actionDefinition.params) {
      if (params[param.name] !== undefined) {
        filtered[param.name] = params[param.name];
      }
    }

    return this.transport.execute(channel, action, filtered, options);
  }

  /**
   * Read any public URL, auto-detecting the platform.
   */
  async read(url: string, options: ReachCallOptions = {}): Promise<ReachResult> {
    if (!url || !/^https?:\/\//i.test(url)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_URL',
          message: `Expected an absolute http(s) URL, got: ${url}`,
        },
      };
    }

    return this.transport.read(url, options);
  }

  /**
   * Convenience wrapper for the `search` action of a channel.
   */
  async search(
    channel: string,
    query: string,
    params: ReachParams = {},
    options: ReachCallOptions = {}
  ): Promise<ReachResult> {
    return this.execute(channel, 'search', { query, ...params }, options);
  }

  /**
   * List the channels available on the server.
   */
  async listChannels(options: ReachCallOptions = {}): Promise<ReachResult> {
    return this.transport.listChannels();
  }

  /**
   * The statically known platform catalog.
   */
  static get channels(): ChannelSummary[] {
    return CHANNEL_DEFINITIONS.map(channel => ({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      actions: channel.actions.map(action => ({
        name: action.name,
        description: action.description,
        params: action.params.map(param => ({
          name: param.name,
          type: param.type,
          description: param.description,
          required: param.required,
          default: param.default,
        })),
      })),
    }));
  }

  /**
   * Look up a channel definition from the static catalog.
   */
  static getChannel(id: string) {
    return getChannel(id);
  }

  /**
   * Look up an action definition from the static catalog.
   */
  static getAction(channelId: string, actionName: string) {
    return getAction(channelId, actionName);
  }
}

/**
 * Build a transport from client options.
 */
export function createTransport(options: ReachClientOptions = {}): ReachTransport {
  if (options.mode === 'a2a') {
    return new A2ATransport({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      headers: options.headers,
    });
  }

  return new CliTransport({
    binPath: options.binPath,
    timeoutMs: options.timeoutMs,
  });
}

/**
 * Convenience factory: `const reach = createReach()`.
 */
export function createReach(options: ReachClientOptions = {}): ReachClient {
  return new ReachClient(options);
}
