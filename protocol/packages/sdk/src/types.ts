/**
 * Agent-Reach SDK Types
 *
 * Shared result and error shapes used by every transport and adapter.
 */

/** A single retrieved item. */
export interface ReachItem {
  title: string;
  url: string;
  author?: string;
  published_at?: string;
  text: string;
  raw?: Record<string, unknown>;
}

/** Structured error returned by the Agent-Reach backend. */
export interface ReachErrorPayload {
  code: string;
  message: string;
  hint?: string;
  retry_after_seconds?: number;
}

/** Normalized result of a reach operation. */
export interface ReachResult {
  ok: boolean;
  items?: ReachItem[];
  error?: ReachErrorPayload;
  meta?: Record<string, unknown>;
}

/**
 * Error thrown by the SDK when an operation fails.
 *
 * Carries the backend error code so callers can branch on it without
 * string-matching the message.
 */
export class ReachError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly retryAfterSeconds?: number;

  constructor(payload: ReachErrorPayload) {
    super(payload.message);
    this.name = 'ReachError';
    this.code = payload.code;
    this.hint = payload.hint;
    this.retryAfterSeconds = payload.retry_after_seconds;
  }

  /** Rebuild a ReachError from an arbitrary thrown value. */
  static from(error: unknown): ReachError {
    if (error instanceof ReachError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new ReachError({ code: 'UNKNOWN_ERROR', message });
  }
}

/** Parameters accepted by a channel action. */
export type ReachParams = Record<string, string | number | boolean | undefined>;

/** Options common to every call. */
export interface ReachCallOptions {
  /** Force a specific backend instead of the automatic fallback chain. */
  backend?: string;
  /** Per-call timeout in milliseconds. */
  timeoutMs?: number;
}

/** A transport carries reach operations to a backend. */
export interface ReachTransport {
  /** Execute a channel action, e.g. `github` / `search`. */
  execute(
    channel: string,
    action: string,
    params?: ReachParams,
    options?: ReachCallOptions
  ): Promise<ReachResult>;

  /** Read any public URL, auto-detecting the platform. */
  read(url: string, options?: ReachCallOptions): Promise<ReachResult>;

  /** List the channels this transport can reach. */
  listChannels(): Promise<ReachResult>;

  /** Human-readable name of the transport, used in error messages. */
  readonly name: string;
}

/** Description of a platform exposed by the server. */
export interface ChannelSummary {
  id: string;
  name: string;
  description: string;
  actions: Array<{
    name: string;
    description: string;
    params: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
      default?: unknown;
    }>;
  }>;
}
