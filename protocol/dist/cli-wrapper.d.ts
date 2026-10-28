/**
 * Agent-Reach CLI Wrapper
 * Spawns the agent-reach Python CLI and handles JSON communication
 */
export interface AgentReachResult {
    ok: boolean;
    items?: Array<{
        title: string;
        url: string;
        author?: string;
        published_at?: string;
        text: string;
        raw?: Record<string, unknown>;
    }>;
    error?: {
        code: string;
        message: string;
        hint?: string;
        retry_after_seconds?: number;
    };
    meta?: {
        update?: {
            latest: string;
            current: string;
            notes: string[];
        };
    };
}
export interface ExecuteOptions {
    channel: string;
    action: string;
    params: Record<string, string | number | boolean>;
    backend?: string;
    textOutput?: boolean;
}
/**
 * Resolve the agent-reach executable.
 *
 * Lookup order:
 *   1. AGENT_REACH_BIN environment variable (explicit override)
 *   2. agent-reach on PATH
 *   3. Well-known install locations for the current platform
 *
 * No absolute user-specific path is hardcoded: where the CLI lives depends on
 * who runs the server, so it is resolved at runtime instead.
 */
export declare function resolveAgentReachBin(): string;
/**
 * Build the child environment: forward the parent env and prepend the
 * directories that commonly hold the agent-reach CLI to PATH, so that the
 * backends agent-reach launches (gh, yt-dlp, bili-cli...) can be found too.
 */
export declare function buildChildEnv(): NodeJS.ProcessEnv;
/**
 * Execute agent-reach command and parse JSON output
 */
export declare function executeAgentReach(options: ExecuteOptions): Promise<AgentReachResult>;
/**
 * Execute a channel action with proper parameter validation
 */
export declare function executeChannelAction(channelId: string, actionName: string, params: Record<string, unknown>, backend?: string): Promise<AgentReachResult>;
/**
 * Execute auto-channel read (agent-reach read <url>)
 */
export declare function executeAutoRead(url: string, backend?: string): Promise<AgentReachResult>;
/**
 * List all channels (agent-reach channels)
 */
export declare function listChannels(textOutput?: boolean): Promise<AgentReachResult>;
/**
 * Check if agent-reach is installed and working
 */
export declare function checkAgentReach(): Promise<boolean>;
/**
 * Get agent-reach version
 */
export declare function getVersion(): Promise<string>;
//# sourceMappingURL=cli-wrapper.d.ts.map