/**
 * Agent-Reach Channel Definitions (SDK)
 *
 * Canonical catalog of the 14 built-in platforms and their actions.
 * Shared by the MCP server, the A2A server and the SDK so that every
 * surface exposes exactly the same tool set.
 */
export interface ActionParam {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
    default?: string | number | boolean;
}
export interface ChannelAction {
    name: string;
    description: string;
    params: ActionParam[];
}
export interface ChannelDefinition {
    id: string;
    name: string;
    description: string;
    actions: ChannelAction[];
}
export declare const CHANNEL_DEFINITIONS: ChannelDefinition[];
/**
 * Get all tool names for registration
 */
export declare function getAllToolNames(): string[];
/**
 * Get channel definition by ID
 */
export declare function getChannel(id: string): ChannelDefinition | undefined;
/**
 * Get action definition
 */
export declare function getAction(channelId: string, actionName: string): ChannelAction | undefined;
//# sourceMappingURL=channels.d.ts.map