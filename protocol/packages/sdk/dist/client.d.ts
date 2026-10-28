/**
 * Agent-Reach SDK Client
 *
 * The single entry point for programmatic access to Agent-Reach.
 * Wraps a transport (CLI for local use, A2A for remote) and exposes a
 * small, stable API that framework adapters build on.
 */
import type { ReachTransport, ReachResult, ReachCallOptions, ReachParams, ChannelSummary } from './types.js';
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
export declare class ReachClient {
    private readonly transport;
    constructor(options?: ReachClientOptions);
    /** The transport in use. */
    get transportName(): string;
    /**
     * Execute a channel action.
     *
     * @param channel - Platform id, e.g. `github`, `bilibili`, `xiaohongshu`
     * @param action - Action name, e.g. `search`, `read`
     * @param params - Action parameters, validated against the catalog
     */
    execute(channel: string, action: string, params?: ReachParams, options?: ReachCallOptions): Promise<ReachResult>;
    /**
     * Read any public URL, auto-detecting the platform.
     */
    read(url: string, options?: ReachCallOptions): Promise<ReachResult>;
    /**
     * Convenience wrapper for the `search` action of a channel.
     */
    search(channel: string, query: string, params?: ReachParams, options?: ReachCallOptions): Promise<ReachResult>;
    /**
     * List the channels available on the server.
     */
    listChannels(options?: ReachCallOptions): Promise<ReachResult>;
    /**
     * The statically known platform catalog.
     */
    static get channels(): ChannelSummary[];
    /**
     * Look up a channel definition from the static catalog.
     */
    static getChannel(id: string): import("./channels.js").ChannelDefinition | undefined;
    /**
     * Look up an action definition from the static catalog.
     */
    static getAction(channelId: string, actionName: string): import("./channels.js").ChannelAction | undefined;
}
/**
 * Build a transport from client options.
 */
export declare function createTransport(options?: ReachClientOptions): ReachTransport;
/**
 * Convenience factory: `const reach = createReach()`.
 */
export declare function createReach(options?: ReachClientOptions): ReachClient;
//# sourceMappingURL=client.d.ts.map