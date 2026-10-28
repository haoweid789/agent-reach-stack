/**
 * @agent-reach/langgraph
 *
 * LangGraph adapter for Agent-Reach.
 *
 * ```ts
 * import { createReachNode } from '@agent-reach/langgraph';
 *
 * const graph = new StateGraph(State);
 * graph.addNode('search_github', createReachNode('github', 'search'));
 * ```
 */
import { ReachClient, buildActionSchema, coerceParams, formatResult, } from '@agent-reach/sdk';
import { getChannel, getAction } from '@agent-reach/sdk';
/**
 * Create a LangGraph node that performs a channel action.
 *
 * @param channel - Platform id, e.g. `github`
 * @param action - Action name, e.g. `search`
 * @param params - Static parameters merged into every call
 */
export function createReachNode(channel, action, params = {}, options = {}) {
    // Fail fast at graph-build time rather than at runtime.
    if (!getChannel(channel)) {
        throw new Error(`Unknown Agent-Reach channel: ${channel}`);
    }
    if (!getAction(channel, action)) {
        throw new Error(`Unknown Agent-Reach action: ${action} for channel ${channel}`);
    }
    const { outputKey = 'reach', inputKey = 'reachArgs' } = options;
    const client = options.transport ? new ReachClient(options) : new ReachClient(options);
    return async (state) => {
        const raw = state?.[inputKey];
        const dynamicParams = raw && typeof raw === 'object' ? raw : {};
        const merged = coerceParams(channel, action, {
            ...dynamicParams,
            ...params,
        });
        const result = await client.execute(channel, action, merged);
        const text = formatResult(result);
        return {
            [outputKey]: text,
        };
    };
}
/**
 * Create a node that reads an arbitrary URL, auto-detecting the platform.
 */
export function createReachReadNode(options = {}) {
    const { outputKey = 'reach', inputKey = 'reachArgs', urlKey = 'url' } = options;
    const client = new ReachClient(options);
    return async (state) => {
        const source = state;
        const url = (typeof source[urlKey] === 'string' ? source[urlKey] : undefined) ??
            (source[inputKey] && typeof source[inputKey] === 'object'
                ? source[inputKey].url
                : undefined);
        if (!url) {
            return {
                [outputKey]: 'Error: no URL provided (set state.url or state.reachArgs.url)',
            };
        }
        const result = await client.read(url);
        return { [outputKey]: formatResult(result) };
    };
}
/**
 * Create a tool spec that can be adapted to any LangChain-compatible runtime.
 */
export function createReachTool(channel, action, options = {}) {
    const channelDefinition = getChannel(channel);
    const actionDefinition = getAction(channel, action);
    if (!channelDefinition || !actionDefinition) {
        throw new Error(`Unknown Agent-Reach channel/action: ${channel}/${action}`);
    }
    const client = new ReachClient(options);
    return {
        name: `${channel}_${action}`,
        description: `[${channelDefinition.name}] ${actionDefinition.description}`,
        schema: buildActionSchema(channel, action),
        func: async (args) => {
            const result = await client.execute(channel, action, coerceParams(channel, action, args));
            return formatResult(result);
        },
    };
}
export { buildActionSchema, formatResult };
//# sourceMappingURL=index.js.map