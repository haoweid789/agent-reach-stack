/**
 * Agent-Reach CLI Transport
 *
 * Spawns the `agent-reach` Python CLI directly. This is the fastest path
 * (no HTTP round-trip) and the default for local usage.
 */
import type { ReachTransport, ReachResult, ReachCallOptions, ReachParams } from './types.js';
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
/** Options for the CLI transport. */
export interface CliTransportOptions {
    /** Override the executable path. */
    binPath?: string;
    /** Default timeout in milliseconds. */
    timeoutMs?: number;
}
/**
 * Transport that talks to the agent-reach CLI over a child process.
 */
export declare class CliTransport implements ReachTransport {
    readonly name = "cli";
    private readonly binPath?;
    private readonly timeoutMs;
    constructor(options?: CliTransportOptions);
    execute(channel: string, action: string, params?: ReachParams, options?: ReachCallOptions): Promise<ReachResult>;
    read(url: string, options?: ReachCallOptions): Promise<ReachResult>;
    listChannels(): Promise<ReachResult>;
    /** Run the CLI and parse its JSON output. */
    private run;
}
/**
 * Parse the CLI's stdout into a normalized result.
 *
 * Exported for testing: the parsing rules are the part most likely to break
 * when the upstream CLI changes its output shape.
 */
export declare function parseCliOutput(stdout: string, stderr: string, code: number | null): ReachResult;
/**
 * Normalize an arbitrary payload into the SDK result shape.
 */
export declare function normalizeResult(payload: Record<string, unknown>): ReachResult;
//# sourceMappingURL=cli-transport.d.ts.map