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

import {
  ReachClient,
  buildActionSchema,
  coerceParams,
  formatResult,
  type ReachClientOptions,
} from '@agent-reach/sdk';
import { getChannel, getAction } from '@agent-reach/sdk';

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
export function ReachFunction(
  channel: string,
  action: string,
  options: ReachFunctionOptions = {}
): ReachAutoGenFunction {
  const channelDefinition = getChannel(channel);
  const actionDefinition = getAction(channel, action);

  if (!channelDefinition || !actionDefinition) {
    throw new Error(`Unknown Agent-Reach channel/action: ${channel}/${action}`);
  }

  const client = new ReachClient(options);

  return {
    name: options.name ?? `${channel}_${action}`,
    description:
      options.description ??
      `[${channelDefinition.name}] ${actionDefinition.description}. ` +
        `Parameters: ${actionDefinition.params.map(p => p.name).join(', ')}.`,
    parameters: buildActionSchema(channel, action),
    execute: async (args: Record<string, unknown>) => {
      const result = await client.execute(
        channel,
        action,
        coerceParams(channel, action, args)
      );
      return formatResult(result);
    },
  };
}

/**
 * Create a function that reads any public URL, auto-detecting the platform.
 */
export function ReachReadFunction(options: ReachFunctionOptions = {}): ReachAutoGenFunction {
  const client = new ReachClient(options);

  return {
    name: options.name ?? 'read_url',
    description:
      options.description ??
      'Read any public URL. The platform is detected automatically ' +
        '(GitHub, Bilibili, YouTube, Twitter, Reddit, Xiaohongshu, ...).',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to read' },
      },
      required: ['url'],
    },
    execute: async (args: Record<string, unknown>) => {
      const url = typeof args.url === 'string' ? args.url : '';
      const result = await client.read(url);
      return formatResult(result);
    },
  };
}

/**
 * Create one function per action of a channel.
 */
export function ReachChannelFunctions(
  channel: string,
  options: ReachFunctionOptions = {}
): ReachAutoGenFunction[] {
  const channelDefinition = getChannel(channel);
  if (!channelDefinition) {
    throw new Error(`Unknown Agent-Reach channel: ${channel}`);
  }

  return channelDefinition.actions.map(action =>
    ReachFunction(channel, action.name, options)
  );
}

/**
 * Create functions for several channels at once.
 */
export function ReachFunctions(
  channels: Array<{ channel: string; action?: string }>,
  options: ReachFunctionOptions = {}
): ReachAutoGenFunction[] {
  return channels.flatMap(entry => {
    if (entry.action) {
      return [ReachFunction(entry.channel, entry.action, options)];
    }
    return ReachChannelFunctions(entry.channel, options);
  });
}

export { buildActionSchema, formatResult };
