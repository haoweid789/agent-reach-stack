/**
 * Shared adapter helpers
 *
 * The framework adapters deliberately avoid importing their target framework.
 * Each framework's tool/function shape is a plain object, so typing them
 * structurally keeps the adapters dependency-free and immune to framework
 * version drift - the framework is an optional peer dependency.
 */
import { CHANNEL_DEFINITIONS, getChannel, getAction } from './channels.js';
/**
 * Build a JSON Schema object for a channel action.
 *
 * @param channel - Platform id
 * @param action - Action name
 * @param includeDefaults - Whether to carry the catalog defaults into the schema
 */
export function buildActionSchema(channel, action, includeDefaults = true) {
    const definition = getChannel(channel);
    const actionDefinition = getAction(channel, action);
    if (!definition || !actionDefinition) {
        throw new Error(`Unknown channel/action: ${channel}/${action}. ` +
            `Known channels: ${listChannelIds().join(', ')}`);
    }
    const properties = {};
    const required = [];
    for (const param of actionDefinition.params) {
        properties[param.name] = {
            type: param.type,
            description: param.description,
            ...(includeDefaults && param.default !== undefined ? { default: param.default } : {}),
        };
        if (param.required) {
            required.push(param.name);
        }
    }
    return { type: 'object', properties, required };
}
/** List all known channel ids. */
export function listChannelIds() {
    return CHANNEL_DEFINITIONS.map(c => c.id);
}
/**
 * Render a result as the plain text that LLM-facing frameworks expect.
 *
 * Frameworks pass tool output straight into the model context, so the text
 * form has to be readable and compact.
 */
export function formatResult(result) {
    if (!result.ok) {
        const error = result.error;
        const parts = [`Error: ${error?.message ?? 'unknown error'}`];
        if (error?.hint) {
            parts.push(`Hint: ${error.hint}`);
        }
        return parts.join('\n');
    }
    const items = result.items ?? [];
    if (items.length === 0) {
        return 'No results found.';
    }
    return items
        .map((item, index) => {
        const lines = [`${index + 1}. ${item.title || '(untitled)'}`];
        if (item.url)
            lines.push(`   ${item.url}`);
        if (item.author)
            lines.push(`   by ${item.author}`);
        if (item.published_at)
            lines.push(`   @ ${item.published_at}`);
        if (item.text) {
            const text = item.text.length > 800 ? `${item.text.slice(0, 800)}...` : item.text;
            lines.push(`   ${text}`);
        }
        return lines.join('\n');
    })
        .join('\n\n');
}
/**
 * Run an action through a client and return both the raw result and the
 * formatted text. Adapters use whichever fits their framework.
 */
export async function runAction(client, channel, action, params, options) {
    const result = await client.execute(channel, action, params, options);
    return { result, text: formatResult(result) };
}
/**
 * Coerce loosely-typed tool arguments into the parameter types the catalog
 * declares. Frameworks often hand over everything as strings.
 */
export function coerceParams(channel, action, args) {
    const actionDefinition = getAction(channel, action);
    const params = {};
    if (!actionDefinition) {
        return params;
    }
    for (const param of actionDefinition.params) {
        const value = args[param.name];
        if (value === undefined || value === null)
            continue;
        if (param.type === 'number') {
            const num = typeof value === 'number' ? value : Number(value);
            if (!Number.isNaN(num)) {
                params[param.name] = num;
            }
        }
        else if (param.type === 'boolean') {
            params[param.name] = typeof value === 'boolean' ? value : value === 'true';
        }
        else {
            params[param.name] = String(value);
        }
    }
    return params;
}
//# sourceMappingURL=adapter-utils.js.map