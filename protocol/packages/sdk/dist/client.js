/**
 * Agent-Reach SDK Client
 *
 * The single entry point for programmatic access to Agent-Reach.
 * Wraps a transport (CLI for local use, A2A for remote) and exposes a
 * small, stable API that framework adapters build on.
 */
import { CliTransport } from './cli-transport.js';
import { A2ATransport } from './a2a-transport.js';
import { CHANNEL_DEFINITIONS, getChannel, getAction } from './channels.js';
/**
 * Unified client over the Agent-Reach platform catalog.
 *
 * ```ts
 * const reach = new ReachClient();
 * const result = await reach.execute('github', 'search', { query: 'react hooks' });
 * ```
 */
export class ReachClient {
    transport;
    constructor(options = {}) {
        this.transport = options.transport ?? createTransport(options);
    }
    /** The transport in use. */
    get transportName() {
        return this.transport.name;
    }
    /**
     * Execute a channel action.
     *
     * @param channel - Platform id, e.g. `github`, `bilibili`, `xiaohongshu`
     * @param action - Action name, e.g. `search`, `read`
     * @param params - Action parameters, validated against the catalog
     */
    async execute(channel, action, params = {}, options = {}) {
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
        const filtered = {};
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
    async read(url, options = {}) {
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
    async search(channel, query, params = {}, options = {}) {
        return this.execute(channel, 'search', { query, ...params }, options);
    }
    /**
     * List the channels available on the server.
     */
    async listChannels(options = {}) {
        return this.transport.listChannels();
    }
    /**
     * The statically known platform catalog.
     */
    static get channels() {
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
    static getChannel(id) {
        return getChannel(id);
    }
    /**
     * Look up an action definition from the static catalog.
     */
    static getAction(channelId, actionName) {
        return getAction(channelId, actionName);
    }
}
/**
 * Build a transport from client options.
 */
export function createTransport(options = {}) {
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
export function createReach(options = {}) {
    return new ReachClient(options);
}
//# sourceMappingURL=client.js.map