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
import { buildActionSchema, formatResult, type ReachClientOptions, type ReachParams } from '@agent-reach/sdk';
/**
 * A CrewAI-compatible tool.
 *
 * CrewAI tools are plain objects with `name`, `description` and an
 * invokable `run`. Typing it structurally keeps this package free of a
 * hard dependency on crewai.
 */
export interface ReachCrewTool {
    name: string;
    description: string;
    /** JSON Schema of the tool arguments. */
    args_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
    };
    /** Execute the tool. */
    run(args: Record<string, unknown>): Promise<string>;
    /** Alias some runtimes look for. */
    _run(args: Record<string, unknown>): Promise<string>;
}
/** Options for a CrewAI tool. */
export interface ReachToolOptions extends ReachClientOptions {
    /** Override the tool name. */
    name?: string;
    /** Override the tool description. */
    description?: string;
}
/**
 * Create a CrewAI tool bound to a channel action.
 *
 * @param channel - Platform id, e.g. `xiaohongshu`
 * @param action - Action name, e.g. `search`
 */
export declare function ReachTool(channel: string, action: string, options?: ReachToolOptions): ReachCrewTool;
/**
 * Create a tool that reads any public URL, auto-detecting the platform.
 */
export declare function ReachReadTool(options?: ReachToolOptions): ReachCrewTool;
/**
 * Create one tool per action of a channel.
 */
export declare function ReachChannelTools(channel: string, options?: ReachToolOptions): ReachCrewTool[];
/**
 * Create tools for several channels at once.
 */
export declare function ReachTools(channels: Array<{
    channel: string;
    action?: string;
    params?: ReachParams;
}>, options?: ReachToolOptions): ReachCrewTool[];
export { buildActionSchema, formatResult };
//# sourceMappingURL=index.d.ts.map