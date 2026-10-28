/**
 * Agent-Reach SDK Types
 *
 * Shared result and error shapes used by every transport and adapter.
 */
/**
 * Error thrown by the SDK when an operation fails.
 *
 * Carries the backend error code so callers can branch on it without
 * string-matching the message.
 */
export class ReachError extends Error {
    code;
    hint;
    retryAfterSeconds;
    constructor(payload) {
        super(payload.message);
        this.name = 'ReachError';
        this.code = payload.code;
        this.hint = payload.hint;
        this.retryAfterSeconds = payload.retry_after_seconds;
    }
    /** Rebuild a ReachError from an arbitrary thrown value. */
    static from(error) {
        if (error instanceof ReachError) {
            return error;
        }
        const message = error instanceof Error ? error.message : String(error);
        return new ReachError({ code: 'UNKNOWN_ERROR', message });
    }
}
//# sourceMappingURL=types.js.map