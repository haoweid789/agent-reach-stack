/**
 * Agent-Reach Plugin SDK
 * npm package: @agent-reach/plugin-sdk
 * Third-party developers use this to build plugins
 */
export * from './plugin-types.js';
export interface PluginItemInput {
    title: string;
    url: string;
    author?: string;
    published_at?: string | Date;
    text: string;
    raw?: Record<string, unknown>;
}
export declare function createPluginResult(items: PluginItemInput[], meta?: Record<string, unknown>): {
    ok: true;
    items: PluginItemInput[];
    meta?: Record<string, unknown>;
};
export declare function createPluginError(code: string, message: string, hint?: string, retryAfterSeconds?: number): {
    ok: false;
    error: {
        code: string;
        message: string;
        hint?: string;
        retry_after_seconds?: number;
    };
};
export declare const PluginErrorCodes: {
    readonly UNKNOWN_ACTION: "UNKNOWN_ACTION";
    readonly MISSING_PARAM: "MISSING_PARAM";
    readonly INVALID_PARAM: "INVALID_PARAM";
    readonly NETWORK_ERROR: "NETWORK_ERROR";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly AUTH_REQUIRED: "AUTH_REQUIRED";
    readonly PLATFORM_BLOCKED: "PLATFORM_BLOCKED";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly PARSE_ERROR: "PARSE_ERROR";
    readonly TIMEOUT: "TIMEOUT";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
export interface HttpClientOptions {
    baseUrl?: string;
    defaultHeaders?: Record<string, string>;
    timeout?: number;
    retry?: {
        attempts: number;
        delayMs: number;
        backoffMultiplier: number;
    };
}
export declare class PluginHttpClient {
    private baseUrl;
    private defaultHeaders;
    private timeout;
    private retryConfig;
    constructor(options?: HttpClientOptions);
    private requestWithRetry;
    get<T>(url: string, params?: Record<string, string>, headers?: Record<string, string>): Promise<T>;
    post<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T>;
    put<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T>;
    delete<T>(url: string, headers?: Record<string, string>): Promise<T>;
    request<T>(options: {
        method: string;
        url: string;
        data?: unknown;
        headers?: Record<string, string>;
    }): Promise<T>;
}
export interface CacheOptions {
    ttlMs?: number;
    maxSize?: number;
}
export declare class PluginCache<K = string, V = unknown> {
    private cache;
    private defaultTtl;
    private maxSize;
    constructor(options?: CacheOptions);
    get(key: K): V | null;
    set(key: K, value: V, ttlMs?: number): void;
    delete(key: K): boolean;
    has(key: K): boolean;
    clear(): void;
    size(): number;
    cleanup(): number;
}
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LoggerOptions {
    prefix?: string;
    level?: LogLevel;
    format?: 'json' | 'text';
}
export declare class PluginLogger {
    private prefix;
    private level;
    private format;
    private levels;
    constructor(options?: LoggerOptions);
    private shouldLog;
    private formatMessage;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    child(prefix: string): PluginLogger;
}
export interface ConfigSchema {
    [key: string]: {
        type: 'string' | 'number' | 'boolean' | 'array';
        description: string;
        required?: boolean;
        default?: unknown;
        enum?: unknown[];
    };
}
export declare function validateConfig(config: Record<string, unknown>, schema: ConfigSchema): {
    valid: boolean;
    errors: string[];
    validated: Record<string, unknown>;
};
export interface PluginBuilderOptions {
    name: string;
    channel: string;
    displayName: string;
    version?: string;
    description?: string;
    author?: string;
    license?: string;
}
export declare class PluginBuilder {
    private manifest;
    private actions;
    constructor(options: PluginBuilderOptions);
    addAction(action: Omit<import('./plugin-types.js').PluginAction, 'name'> & {
        name: string;
    }): this;
    setAuth(auth: import('./plugin-types.js').PluginAuth): this;
    setRequirements(req: import('./plugin-types.js').PluginRequirements): this;
    setCompat(compat: import('./plugin-types.js').PluginCompat): this;
    setRepository(url: string): this;
    setHomepage(url: string): this;
    addKeyword(keyword: string): this;
    build(): import('./plugin-types.js').PluginManifest;
    generateCode(): string;
}
export declare function createPlugin(builder: (b: PluginBuilder) => PluginBuilder): import("./plugin-types.js").PluginManifest;
//# sourceMappingURL=plugin-sdk.d.ts.map