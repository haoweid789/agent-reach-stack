/**
 * Agent-Reach CLI Transport
 *
 * Spawns the `agent-reach` Python CLI directly. This is the fastest path
 * (no HTTP round-trip) and the default for local usage.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import type {
  ReachTransport,
  ReachResult,
  ReachCallOptions,
  ReachParams,
} from './types.js';
import { ReachError } from './types.js';

const DEFAULT_TIMEOUT_MS = 120_000;

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
export function resolveAgentReachBin(): string {
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
export function buildChildEnv(): NodeJS.ProcessEnv {
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
export class CliTransport implements ReachTransport {
  readonly name = 'cli';

  private readonly binPath?: string;
  private readonly timeoutMs: number;

  constructor(options: CliTransportOptions = {}) {
    this.binPath = options.binPath;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async execute(
    channel: string,
    action: string,
    params: ReachParams = {},
    options: ReachCallOptions = {}
  ): Promise<ReachResult> {
    const args = [channel, action];

    for (const value of Object.values(params)) {
      if (value !== undefined && value !== '') {
        args.push(String(value));
      }
    }

    if (options.backend) {
      args.push('--backend', options.backend);
    }

    return this.run(args, options.timeoutMs);
  }

  async read(url: string, options: ReachCallOptions = {}): Promise<ReachResult> {
    return this.run(['read', url], options.timeoutMs);
  }

  async listChannels(): Promise<ReachResult> {
    return this.run(['channels'], undefined);
  }

  /** Run the CLI and parse its JSON output. */
  private async run(args: string[], timeoutMs?: number): Promise<ReachResult> {
    const command = this.binPath ?? resolveAgentReachBin();

    return new Promise<ReachResult>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildChildEnv(),
        shell: process.platform === 'win32',
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      child.stdout?.on('data', data => {
        stdout += data.toString();
      });

      child.stderr?.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        if (settled) return;
        settled = true;
        resolve(parseCliOutput(stdout, stderr, code));
      });

      child.on('error', error => {
        if (settled) return;
        settled = true;
        reject(
          new ReachError({
            code: 'SPAWN_FAILED',
            message: `Failed to spawn agent-reach: ${error.message}`,
            hint: 'Is the agent-reach CLI installed? See https://github.com/Panniantong/Agent-Reach',
          })
        );
      });

      setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(
          new ReachError({
            code: 'TIMEOUT',
            message: `agent-reach command timed out after ${timeoutMs ?? this.timeoutMs}ms`,
          })
        );
      }, timeoutMs ?? this.timeoutMs);
    });
  }
}

/**
 * Parse the CLI's stdout into a normalized result.
 *
 * Exported for testing: the parsing rules are the part most likely to break
 * when the upstream CLI changes its output shape.
 */
export function parseCliOutput(stdout: string, stderr: string, code: number | null): ReachResult {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return {
      ok: false,
      error: {
        code: 'EMPTY_OUTPUT',
        message: 'No output from agent-reach',
        hint: stderr || undefined,
      },
    };
  }

  // The CLI prints a single JSON object; find it even if a warning precedes it.
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed === 'object' && parsed !== null) {
        return normalizeResult(parsed);
      }
    } catch {
      // fall through to the text-wrapping branch
    }
  }

  // Non-JSON output (e.g. --text mode): wrap it so callers always get items.
  return {
    ok: code === 0,
    items: [{ title: '', url: '', text: trimmed }],
  };
}

/**
 * Normalize an arbitrary payload into the SDK result shape.
 */
export function normalizeResult(payload: Record<string, unknown>): ReachResult {
  const result: ReachResult = {
    ok: payload.ok !== false,
  };

  if (Array.isArray(payload.items)) {
    result.items = payload.items.map(item => {
      const record = item as Record<string, unknown>;
      return {
        title: typeof record.title === 'string' ? record.title : '',
        url: typeof record.url === 'string' ? record.url : '',
        author: typeof record.author === 'string' ? record.author : undefined,
        published_at:
          typeof record.published_at === 'string' ? record.published_at : undefined,
        text: typeof record.text === 'string' ? record.text : '',
        raw: typeof record.raw === 'object' && record.raw !== null
          ? (record.raw as Record<string, unknown>)
          : undefined,
      };
    });
  }

  if (payload.error && typeof payload.error === 'object') {
    const err = payload.error as Record<string, unknown>;
    result.error = {
      code: typeof err.code === 'string' ? err.code : 'UNKNOWN_ERROR',
      message: typeof err.message === 'string' ? err.message : 'Unknown error',
      hint: typeof err.hint === 'string' ? err.hint : undefined,
      retry_after_seconds:
        typeof err.retry_after_seconds === 'number' ? err.retry_after_seconds : undefined,
    };
    result.ok = false;
  }

  if (payload.meta && typeof payload.meta === 'object') {
    result.meta = payload.meta as Record<string, unknown>;
  }

  return result;
}
