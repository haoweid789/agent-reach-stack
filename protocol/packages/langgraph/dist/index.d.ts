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
import { buildActionSchema, formatResult, type ReachClientOptions, type ReachParams } from '@agent-reach/sdk';
/** Options for a LangGraph node. */
export interface ReachNodeOptions extends ReachClientOptions {
    /**
     * Key in the graph state where the formatted output is written.
     * Defaults to `reach`.
     */
    outputKey?: string;
    /**
     * Key in the graph state holding the tool arguments.
     * Defaults to `reachArgs`.
     */
    inputKey?: string;
}
/**
 * The shape of a LangGraph node function.
 *
 * LangGraph calls a node with the current state and expects the updated
 * state back, so the adapter is typed loosely on purpose - it stays
 * compatible with any state schema.
 */
export type ReachNode<TState = Record<string, unknown>> = (state: TState) => Promise<Partial<TState>>;
/**
 * Create a LangGraph node that performs a channel action.
 *
 * @param channel - Platform id, e.g. `github`
 * @param action - Action name, e.g. `search`
 * @param params - Static parameters merged into every call
 */
export declare function createReachNode<TState = Record<string, unknown>>(channel: string, action: string, params?: ReachParams, options?: ReachNodeOptions): ReachNode<TState>;
/**
 * Create a node that reads an arbitrary URL, auto-detecting the platform.
 */
export declare function createReachReadNode<TState = Record<string, unknown>>(options?: ReachNodeOptions & {
    urlKey?: string;
    inputKey?: string;
}): ReachNode<TState>;
/**
 * Build a LangChain-style tool spec for a channel action.
 *
 * Useful when you want the tool registered with LangChain's tool registry
 * rather than wired into a graph directly.
 */
export interface ReachToolSpec {
    name: string;
    description: string;
    schema: ReturnType<typeof buildActionSchema>;
    func: (args: Record<string, unknown>) => Promise<string>;
}
/**
 * Create a tool spec that can be adapted to any LangChain-compatible runtime.
 */
export declare function createReachTool(channel: string, action: string, options?: ReachClientOptions): ReachToolSpec;
export { buildActionSchema, formatResult };
//# sourceMappingURL=index.d.ts.map