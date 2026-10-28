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

import {
  ReachClient,
  buildActionSchema,
  coerceParams,
  formatResult,
  type ReachClientOptions,
  type ReachParams,
} from '@agent-reach/sdk';
import { getChannel, getAction } from '@agent-reach/sdk';

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
export type ReachNode<TState = Record<string, unknown>> = (
  state: TState
) => Promise<Partial<TState>>;

/**
 * Create a LangGraph node that performs a channel action.
 *
 * @param channel - Platform id, e.g. `github`
 * @param action - Action name, e.g. `search`
 * @param params - Static parameters merged into every call
 */
export function createReachNode<TState = Record<string, unknown>>(
  channel: string,
  action: string,
  params: ReachParams = {},
  options: ReachNodeOptions = {}
): ReachNode<TState> {
  // Fail fast at graph-build time rather than at runtime.
  if (!getChannel(channel)) {
    throw new Error(`Unknown Agent-Reach channel: ${channel}`);
  }
  if (!getAction(channel, action)) {
    throw new Error(`Unknown Agent-Reach action: ${action} for channel ${channel}`);
  }

  const { outputKey = 'reach', inputKey = 'reachArgs' } = options;
  const client = options.transport ? new ReachClient(options) : new ReachClient(options);

  return async (state: TState): Promise<Partial<TState>> => {
    const raw = (state as Record<string, unknown>)?.[inputKey];
    const dynamicParams =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

    const merged = coerceParams(channel, action, {
      ...dynamicParams,
      ...params,
    });

    const result = await client.execute(channel, action, merged);
    const text = formatResult(result);

    return {
      [outputKey]: text,
    } as Partial<TState>;
  };
}

/**
 * Create a node that reads an arbitrary URL, auto-detecting the platform.
 */
export function createReachReadNode<TState = Record<string, unknown>>(
  options: ReachNodeOptions & { urlKey?: string; inputKey?: string } = {}
): ReachNode<TState> {
  const { outputKey = 'reach', inputKey = 'reachArgs', urlKey = 'url' } = options;
  const client = new ReachClient(options);

  return async (state: TState): Promise<Partial<TState>> => {
    const source = state as Record<string, unknown>;
    const url =
      (typeof source[urlKey] === 'string' ? (source[urlKey] as string) : undefined) ??
      (source[inputKey] && typeof source[inputKey] === 'object'
        ? ((source[inputKey] as Record<string, unknown>).url as string | undefined)
        : undefined);

    if (!url) {
      return {
        [outputKey]: 'Error: no URL provided (set state.url or state.reachArgs.url)',
      } as Partial<TState>;
    }

    const result = await client.read(url);
    return { [outputKey]: formatResult(result) } as Partial<TState>;
  };
}

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
export function createReachTool(
  channel: string,
  action: string,
  options: ReachClientOptions = {}
): ReachToolSpec {
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
    func: async (args: Record<string, unknown>) => {
      const result = await client.execute(
        channel,
        action,
        coerceParams(channel, action, args)
      );
      return formatResult(result);
    },
  };
}

export { buildActionSchema, formatResult };
