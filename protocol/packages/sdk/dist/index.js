/**
 * @agent-reach/sdk
 *
 * TypeScript SDK for Agent-Reach.
 *
 * ```ts
 * import { ReachClient } from '@agent-reach/sdk';
 *
 * const reach = new ReachClient();
 * const { items } = await reach.execute('github', 'search', { query: 'react hooks' });
 * ```
 */
export { ReachClient, createReach, createTransport } from './client.js';
export { CliTransport, resolveAgentReachBin, buildChildEnv, parseCliOutput, normalizeResult } from './cli-transport.js';
export { A2ATransport, buildPrompt, artifactsToItems, extractTask } from './a2a-transport.js';
export { ReachError } from './types.js';
export { CHANNEL_DEFINITIONS, getChannel, getAction, getAllToolNames, } from './channels.js';
export { buildActionSchema, formatResult, coerceParams, runAction, listChannelIds, } from './adapter-utils.js';
//# sourceMappingURL=index.js.map