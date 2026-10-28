/**
 * @agent-reach/crewai
 *
 * CrewAI adapter for Agent-Reach.
 *
 * ```ts
 * import { ReachTool } from '@agent-reach/crewai';
 *
 * const agent = new Agent({
 *   role: 'Researcher',
 *   goal: 'Find coffee shops in Shenzhen',
 *   tools: [ReachTool('xiaohongshu', 'search')],
 * });
 * ```
 */
import { ReachClient, buildActionSchema, coerceParams, formatResult, } from '@agent-reach/sdk';
import { getChannel, getAction } from '@agent-reach/sdk';
/**
 * Create a CrewAI tool bound to a channel action.
 *
 * @param channel - Platform id, e.g. `xiaohongshu`
 * @param action - Action name, e.g. `search`
 */
export function ReachTool(channel, action, options = {}) {
    const channelDefinition = getChannel(channel);
    const actionDefinition = getAction(channel, action);
    if (!channelDefinition || !actionDefinition) {
        throw new Error(`Unknown Agent-Reach channel/action: ${channel}/${action}`);
    }
    const client = new ReachClient(options);
    const schema = buildActionSchema(channel, action);
    const run = async (args) => {
        const result = await client.execute(channel, action, coerceParams(channel, action, args));
        return formatResult(result);
    };
    return {
        name: options.name ?? `${channel}_${action}`,
        description: options.description ??
            `[${channelDefinition.name}] ${actionDefinition.description}. ` +
                `Parameters: ${actionDefinition.params.map(p => p.name).join(', ')}.`,
        args_schema: schema,
        run,
        _run: run,
    };
}
/**
 * Create a tool that reads any public URL, auto-detecting the platform.
 */
export function ReachReadTool(options = {}) {
    const client = new ReachClient(options);
    const run = async (args) => {
        const url = typeof args.url === 'string' ? args.url : '';
        const result = await client.read(url);
        return formatResult(result);
    };
    return {
        name: options.name ?? 'read_url',
        description: options.description ??
            'Read any public URL. The platform is detected automatically ' +
                '(GitHub, Bilibili, YouTube, Twitter, Reddit, Xiaohongshu, ...).',
        args_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'The URL to read' },
            },
            required: ['url'],
        },
        run,
        _run: run,
    };
}
/**
 * Create one tool per action of a channel.
 */
export function ReachChannelTools(channel, options = {}) {
    const channelDefinition = getChannel(channel);
    if (!channelDefinition) {
        throw new Error(`Unknown Agent-Reach channel: ${channel}`);
    }
    return channelDefinition.actions.map(action => ReachTool(channel, action.name, options));
}
/**
 * Create tools for several channels at once.
 */
export function ReachTools(channels, options = {}) {
    return channels.flatMap(entry => {
        if (entry.action) {
            return [ReachTool(entry.channel, entry.action, options)];
        }
        return ReachChannelTools(entry.channel, options);
    });
}
export { buildActionSchema, formatResult };
//# sourceMappingURL=index.js.map