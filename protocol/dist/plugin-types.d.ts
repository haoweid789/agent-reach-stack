/**
 * Agent-Reach Plugin System Types
 * Enables third-party platforms via npm packages
 */
export interface PluginManifest {
    name: string;
    version: string;
    channel: string;
    displayName: string;
    description: string;
    author: string;
    license: string;
    repository?: string;
    homepage?: string;
    keywords: string[];
    entryPoint: string;
    actions: PluginAction[];
    auth?: PluginAuth;
    requirements?: PluginRequirements;
    compat?: PluginCompat;
}
export interface PluginAction {
    name: string;
    description: string;
    params: PluginParam[];
    examples?: string[];
    backends?: string[];
}
export interface PluginParam {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    default?: unknown;
    enum?: string[];
}
export interface PluginAuth {
    type: 'none' | 'cookie' | 'apikey' | 'oauth2' | 'header' | 'custom';
    required: boolean;
    description?: string;
    configSchema?: Record<string, PluginParam>;
}
export interface PluginRequirements {
    node?: string;
    python?: string;
    binary?: string[];
    env?: string[];
}
export interface PluginCompat {
    agentReach: string;
    mcp?: string;
    a2a?: string;
}
export interface PluginChannelDefinition {
    id: string;
    name: string;
    description: string;
    actions: PluginAction[];
    auth?: PluginAuth;
}
export interface PluginModule {
    manifest: PluginManifest;
    onLoad?: (context: PluginContext) => Promise<void> | void;
    onUnload?: (context: PluginContext) => Promise<void> | void;
    execute: (actionName: string, params: Record<string, unknown>, context: PluginContext) => Promise<PluginResult>;
    backends?: Record<string, PluginBackend>;
}
export interface PluginBackend {
    name: string;
    description: string;
    execute: (actionName: string, params: Record<string, unknown>, context: PluginContext) => Promise<PluginResult>;
}
export interface PluginContext {
    pluginDir: string;
    dataDir: string;
    config: Record<string, unknown>;
    logger: PluginLogger;
    httpClient: PluginHttpClient;
    cache: PluginCache;
}
export interface PluginLogger {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
}
export interface PluginHttpClient {
    get: (url: string, options?: RequestOptions) => Promise<HttpResponse>;
    post: (url: string, data?: unknown, options?: RequestOptions) => Promise<HttpResponse>;
    request: (options: RequestOptions) => Promise<HttpResponse>;
}
export interface RequestOptions {
    headers?: Record<string, string>;
    timeout?: number;
    params?: Record<string, string>;
    responseType?: 'json' | 'text' | 'buffer';
}
export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: unknown;
}
export interface PluginCache {
    get: <T>(key: string) => Promise<T | null>;
    set: <T>(key: string, value: T, ttlMs?: number) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
}
export interface PluginResult {
    ok: boolean;
    items?: PluginItem[];
    error?: PluginError;
    meta?: Record<string, unknown>;
}
export interface PluginItem {
    title: string;
    url: string;
    author?: string;
    published_at?: string;
    text: string;
    raw?: Record<string, unknown>;
}
export interface PluginError {
    code: string;
    message: string;
    hint?: string;
    retry_after_seconds?: number;
}
export interface PluginRegistryEntry {
    name: string;
    version: string;
    description: string;
    channel: string;
    displayName: string;
    author: string;
    keywords: string[];
    downloads?: number;
    updatedAt: string;
    manifest: PluginManifest;
}
export interface PluginSearchResult {
    plugins: PluginRegistryEntry[];
    total: number;
    page: number;
    pageSize: number;
}
//# sourceMappingURL=plugin-types.d.ts.map