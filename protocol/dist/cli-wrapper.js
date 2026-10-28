/**
 * Agent-Reach CLI Wrapper
 * Spawns the agent-reach Python CLI and handles JSON communication
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { getChannel, getAction } from './channel-definitions.js';
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
export function resolveAgentReachBin() {
    const override = process.env.AGENT_REACH_BIN;
    if (override && existsSync(override)) {
        return override;
    }
    const isWindows = process.platform === 'win32';
    const exeNames = isWindows
        ? ['agent-reach.cmd', 'agent-reach.exe', 'agent-reach.bat', 'agent-reach']
        : ['agent-reach'];
    // 2. Search PATH
    const pathDirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
    for (const dir of pathDirs) {
        for (const name of exeNames) {
            const candidate = join(dir, name);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }
    // 3. Well-known install locations (uv tool install, pipx, cargo, local build)
    const home = homedir();
    const knownDirs = [
        join(home, '.local', 'bin'),
        join(home, '.local', 'share', 'uv', 'tools', 'agent-reach', 'bin'),
        join(home, '.cargo', 'bin'),
        join(home, 'bin'),
        join(home, '.pyenv', 'shims'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
    ];
    for (const dir of knownDirs) {
        for (const name of exeNames) {
            const candidate = join(dir, name);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }
    // Fall back to the bare name and let the OS resolve it via PATH at spawn time
    return isWindows ? 'agent-reach.cmd' : 'agent-reach';
}
/**
 * Build the child environment: forward the parent env and prepend the
 * directories that commonly hold the agent-reach CLI to PATH, so that the
 * backends agent-reach launches (gh, yt-dlp, bili-cli...) can be found too.
 */
export function buildChildEnv() {
    const home = homedir();
    const extraDirs = [
        join(home, '.local', 'bin'),
        join(home, '.local', 'share', 'uv', 'tools', 'agent-reach', 'bin'),
        join(home, '.cargo', 'bin'),
        join(home, 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
    ].filter(dir => existsSync(dir));
    const currentPath = process.env.PATH || '';
    const merged = [...extraDirs, currentPath].filter(Boolean).join(delimiter);
    return {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PATH: merged,
    };
}
/**
 * Execute agent-reach command and parse JSON output
 */
export async function executeAgentReach(options) {
    const { channel, action, params, backend, textOutput } = options;
    // Build command arguments
    const args = [channel, action];
    // Required params go positionally, in declaration order. Optional params MUST
    // be passed as `--name value`: a positional value is silently ignored by the
    // CLI (it falls back to the default), and a float such as 3.0 fails to parse.
    // Declared order matters because the CLI binds positionals by position.
    const spec = getAction(channel, action);
    const ordered = spec ? spec.params.map((p) => p.name).filter((n) => n in params) : Object.keys(params);
    for (const name of ordered) {
        const value = params[name];
        if (value === undefined || value === '')
            continue;
        if (spec?.params.find((p) => p.name === name)?.required) {
            args.push(String(value));
        }
        else {
            args.push(`--${name}`, String(value));
        }
    }
    // Add backend if specified
    if (backend) {
        args.push('--backend', backend);
    }
    // Add --text flag if human-readable output requested
    if (textOutput) {
        args.push('--text');
    }
    return new Promise((resolve, reject) => {
        const agentReachCmd = resolveAgentReachBin();
        const child = spawn(agentReachCmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: buildChildEnv(),
            shell: process.platform === 'win32',
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            // Try to parse JSON from stdout
            let result;
            try {
                // Find the first complete JSON object in stdout
                const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                }
                else if (stdout.trim()) {
                    // If no JSON but has output, wrap it
                    result = {
                        ok: code === 0,
                        items: [{ title: '', url: '', text: stdout.trim() }],
                    };
                }
                else {
                    result = { ok: false, error: { code: 'EMPTY_OUTPUT', message: 'No output from agent-reach' } };
                }
            }
            catch (e) {
                // If JSON parsing fails, check stderr for error
                result = {
                    ok: false,
                    error: {
                        code: 'PARSE_ERROR',
                        message: `Failed to parse output: ${e instanceof Error ? e.message : String(e)}`,
                        hint: stderr || stdout,
                    },
                };
            }
            // Include meta.update if present
            if (result.meta?.update) {
                console.error(`[Agent-Reach] Update available: ${result.meta.update.latest} (current: ${result.meta.update.current})`);
                console.error(`[Agent-Reach] Changes: ${result.meta.update.notes.join('; ')}`);
            }
            resolve(result);
        });
        child.on('error', (err) => {
            if (settled)
                return;
            settled = true;
            reject(new Error(`Failed to spawn agent-reach: ${err.message}`));
        });
        // Timeout after 120 seconds
        setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGTERM');
            reject(new Error('agent-reach command timed out after 120s'));
        }, 120_000);
    });
}
/**
 * Execute a channel action with proper parameter validation
 */
export async function executeChannelAction(channelId, actionName, params, backend) {
    const channel = getChannel(channelId);
    if (!channel) {
        return {
            ok: false,
            error: { code: 'UNKNOWN_CHANNEL', message: `Unknown channel: ${channelId}` },
        };
    }
    const action = getAction(channelId, actionName);
    if (!action) {
        return {
            ok: false,
            error: { code: 'UNKNOWN_ACTION', message: `Unknown action: ${actionName} for channel ${channelId}` },
        };
    }
    // Validate required params
    for (const param of action.params) {
        if (param.required && (params[param.name] === undefined || params[param.name] === '')) {
            return {
                ok: false,
                error: { code: 'MISSING_PARAM', message: `Required parameter missing: ${param.name}` },
            };
        }
    }
    // Filter params to only those defined in action
    const filteredParams = {};
    for (const param of action.params) {
        if (params[param.name] !== undefined) {
            filteredParams[param.name] = params[param.name];
        }
    }
    return executeAgentReach({
        channel: channelId,
        action: actionName,
        params: filteredParams,
        backend,
    });
}
/**
 * Execute auto-channel read (agent-reach read <url>)
 */
export async function executeAutoRead(url, backend) {
    return executeAgentReach({
        channel: 'read',
        action: url,
        params: {},
        backend,
    });
}
/**
 * List all channels (agent-reach channels)
 */
export async function listChannels(textOutput = false) {
    return executeAgentReach({
        channel: 'channels',
        action: '',
        params: {},
        textOutput,
    });
}
/**
 * Check if agent-reach is installed and working
 */
export async function checkAgentReach() {
    try {
        const result = await executeAgentReach({
            channel: 'channels',
            action: '',
            params: {},
        });
        return result.ok;
    }
    catch {
        return false;
    }
}
/**
 * Get agent-reach version
 */
export async function getVersion() {
    try {
        // agent-reach doesn't have a --version flag, try channels command
        const result = await executeAgentReach({
            channel: 'channels',
            action: '',
            params: {},
        });
        // Parse version from meta if available
        if (result.meta?.update?.current) {
            return result.meta.update.current;
        }
        return 'unknown';
    }
    catch {
        return 'unknown';
    }
}
//# sourceMappingURL=cli-wrapper.js.map