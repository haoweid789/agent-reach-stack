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
import { buildActionSchema, formatResult, type ReachClientOptions } from '@agent-reach/sdk';
/**
 * An AutoGen-compatible function.
 *
 * AutoGen expects `name`, `description`, `parameters` (JSON Schema) and an
 * `execute` method. The shape is declared structurally so this package has
 * no hard dependency on @ag2/autogen or @microsoft/autogen.
 */
export interface ReachAutoGenFunction {
    name: string;
    description: string;
    /** JSON Schema of the arguments. */
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
    };
    /** Execute the function. */
    execute(args: Record<string, unknown>): Promise<string>;
}
/** Options for an AutoGen function. */
export interface ReachFunctionOptions extends ReachClientOptions {
    /** Override the function name. */
    name?: string;
    /** Override the function description. */
    description?: string;
}
/**
 * Create an AutoGen function bound to a channel action.
 *
 * @param channel - Platform id, e.g. `bilibili`
 * @param action - Action name, e.g. `read`
 */
export declare function ReachFunction(channel: string, action: string, options?: ReachFunctionOptions): ReachAutoGenFunction;
/**
 * Create a function that reads any public URL, auto-detecting the platform.
 */
export declare function ReachReadFunction(options?: ReachFunctionOptions): ReachAutoGenFunction;
/**
 * Create one function per action of a channel.
 */
export declare function ReachChannelFunctions(channel: string, options?: ReachFunctionOptions): ReachAutoGenFunction[];
/**
 * Create functions for several channels at once.
 */
export declare function ReachFunctions(channels: Array<{
    channel: string;
    action?: string;
}>, options?: ReachFunctionOptions): ReachAutoGenFunction[];
export { buildActionSchema, formatResult };
//# sourceMappingURL=index.d.ts.map