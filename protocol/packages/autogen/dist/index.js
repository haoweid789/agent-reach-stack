/**
 * @agent-reach/autogen
 *
 * AutoGen / AG2 adapter for Agent-Reach.
 *
 * ```ts
 * import { ReachFunction } from '@agent-reach/autogen';
 *
 * const assistant = new ConversableAgent({
 *   name: 'researcher',
 *   functions: [ReachFunction('bilibili', 'read')],
 * });
 * ```
 */
import { ReachClient, buildActionSchema, coerceParams, formatResult, } from '@agent-reach/sdk';
import { getChannel, getAction } from '@agent-reach/sdk';
/**
 * Create an AutoGen function bound to a channel action.
 *
 * @param channel - Platform id, e.g. `bilibili`
 * @param action - Action name, e.g. `read`
 */
export function ReachFunction(channel, action, options = {}) {
    const channelDefinition = getChannel(channel);
    const actionDefinition = getAction(channel, action);
    if (!channelDefinition || !actionDefinition) {
        throw new Error(`Unknown Agent-Reach channel/action: ${channel}/${action}`);
    }
    const client = new ReachClient(options);
    return {
        name: options.name ?? `${channel}_${action}`,
        description: options.description ??
            `[${channelDefinition.name}] ${actionDefinition.description}. ` +
                `Parameters: ${actionDefinition.params.map(p => p.name).join(', ')}.`,
        parameters: buildActionSchema(channel, action),
        execute: async (args) => {
            const result = await client.execute(channel, action, coerceParams(channel, action, args));
            return formatResult(result);
        },
    };
}
/**
 * Create a function that reads any public URL, auto-detecting the platform.
 */
export function ReachReadFunction(options = {}) {
    const client = new ReachClient(options);
    return {
        name: options.name ?? 'read_url',
        description: options.description ??
            'Read any public URL. The platform is detected automatically ' +
                '(GitHub, Bilibili, YouTube, Twitter, Reddit, Xiaohongshu, ...).',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The URL to read' },
            },
            required: ['url'],
        },
        execute: async (args) => {
            const url = typeof args.url === 'string' ? args.url : '';
            const result = await client.read(url);
            return formatResult(result);
        },
    };
}
/**
 * Create one function per action of a channel.
 */
export function ReachChannelFunctions(channel, options = {}) {
    const channelDefinition = getChannel(channel);
    if (!channelDefinition) {
        throw new Error(`Unknown Agent-Reach channel: ${channel}`);
    }
    return channelDefinition.actions.map(action => ReachFunction(channel, action.name, options));
}
/**
 * Create functions for several channels at once.
 */
export function ReachFunctions(channels, options = {}) {
    return channels.flatMap(entry => {
        if (entry.action) {
            return [ReachFunction(entry.channel, entry.action, options)];
        }
        return ReachChannelFunctions(entry.channel, options);
    });
}
export { buildActionSchema, formatResult };
//# sourceMappingURL=index.js.map