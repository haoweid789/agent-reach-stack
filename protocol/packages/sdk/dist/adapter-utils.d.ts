/**
 * Shared adapter helpers
 *
 * The framework adapters deliberately avoid importing their target framework.
 * Each framework's tool/function shape is a plain object, so typing them
 * structurally keeps the adapters dependency-free and immune to framework
 * version drift - the framework is an optional peer dependency.
 */
import type { ReachResult, ReachParams, ReachCallOptions } from './types.js';
import type { ReachClient } from './client.js';
/** JSON Schema object describing a single parameter. */
export interface JsonSchemaProperty {
    type: 'string' | 'number' | 'boolean';
    description: string;
    default?: unknown;
}
/**
 * Build a JSON Schema object for a channel action.
 *
 * @param channel - Platform id
 * @param action - Action name
 * @param includeDefaults - Whether to carry the catalog defaults into the schema
 */
export declare function buildActionSchema(channel: string, action: string, includeDefaults?: boolean): {
    type: 'object';
    properties: Record<string, JsonSchemaProperty>;
    required: string[];
};
/** List all known channel ids. */
export declare function listChannelIds(): string[];
/**
 * Render a result as the plain text that LLM-facing frameworks expect.
 *
 * Frameworks pass tool output straight into the model context, so the text
 * form has to be readable and compact.
 */
export declare function formatResult(result: ReachResult): string;
/**
 * Run an action through a client and return both the raw result and the
 * formatted text. Adapters use whichever fits their framework.
 */
export declare function runAction(client: ReachClient, channel: string, action: string, params: ReachParams, options?: ReachCallOptions): Promise<{
    result: ReachResult;
    text: string;
}>;
/**
 * Coerce loosely-typed tool arguments into the parameter types the catalog
 * declares. Frameworks often hand over everything as strings.
 */
export declare function coerceParams(channel: string, action: string, args: Record<string, unknown>): ReachParams;
//# sourceMappingURL=adapter-utils.d.ts.map