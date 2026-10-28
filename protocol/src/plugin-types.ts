/**
 * Agent-Reach Plugin System Types
 * Enables third-party platforms via npm packages
 */

export interface PluginManifest {
  name: string;                    // npm package name, e.g., "@agent-reach/plugin-zhihu"
  version: string;                 // semver
  channel: string;                 // unique channel ID, e.g., "zhihu"
  displayName: string;             // human-readable, e.g., "Zhihu (知乎)"
  description: string;
  author: string;
  license: string;
  repository?: string;
  homepage?: string;
  keywords: string[];
  entryPoint: string;              // relative to package root, e.g., "dist/index.js"
  actions: PluginAction[];
  auth?: PluginAuth;
  requirements?: PluginRequirements;
  compat?: PluginCompat;
}

export interface PluginAction {
  name: string;                    // e.g., "search", "read", "answers"
  description: string;
  params: PluginParam[];
  examples?: string[];
  backends?: string[];             // backend names this action supports
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
  configSchema?: Record<string, PluginParam>; // for custom auth config
}

export interface PluginRequirements {
  node?: string;                   // e.g., ">=18.0.0"
  python?: string;
  binary?: string[];               // required system binaries
  env?: string[];                  // required env vars
}

export interface PluginCompat {
  agentReach: string;              // semver range, e.g., ">=1.6.0 <2.0.0"
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
  // Lifecycle hooks
  onLoad?: (context: PluginContext) => Promise<void> | void;
  onUnload?: (context: PluginContext) => Promise<void> | void;
  // Action handlers
  execute: (actionName: string, params: Record<string, unknown>, context: PluginContext) => Promise<PluginResult>;
  // Optional: custom backends
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

// ============================================
// Plugin Registry (for publishing/discovery)
// ============================================

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