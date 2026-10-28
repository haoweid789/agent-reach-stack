/**
 * Agent-Reach Plugin SDK
 * npm package: @agent-reach/plugin-sdk
 * Third-party developers use this to build plugins
 */

// Re-export all types
export * from './plugin-types.js';

// ============================================
// Helper functions for plugin authors
// ============================================

export interface PluginItemInput {
  title: string;
  url: string;
  author?: string;
  published_at?: string | Date;
  text: string;
  raw?: Record<string, unknown>;
}

export function createPluginResult(items: PluginItemInput[], meta?: Record<string, unknown>): {
  ok: true;
  items: PluginItemInput[];
  meta?: Record<string, unknown>;
} {
  return {
    ok: true,
    items: items.map(item => ({
      ...item,
      published_at: item.published_at instanceof Date ? item.published_at.toISOString() : item.published_at,
    })),
    meta,
  };
}

export function createPluginError(code: string, message: string, hint?: string, retryAfterSeconds?: number): {
  ok: false;
  error: { code: string; message: string; hint?: string; retry_after_seconds?: number };
} {
  return {
    ok: false,
    error: { code, message, hint, retry_after_seconds: retryAfterSeconds },
  };
}

// Common error codes
export const PluginErrorCodes = {
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  MISSING_PARAM: 'MISSING_PARAM',
  INVALID_PARAM: 'INVALID_PARAM',
  NETWORK_ERROR: 'NETWORK_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  PLATFORM_BLOCKED: 'PLATFORM_BLOCKED',
  NOT_FOUND: 'NOT_FOUND',
  PARSE_ERROR: 'PARSE_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// ============================================
// HTTP Client helpers
// ============================================

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

export class PluginHttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private retryConfig: NonNullable<HttpClientOptions['retry']>;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl || '';
    this.defaultHeaders = options.defaultHeaders || {};
    this.timeout = options.timeout || 30000;
    this.retryConfig = options.retry || { attempts: 3, delayMs: 1000, backoffMultiplier: 2 };
  }

  private async requestWithRetry<T>(
    method: string,
    url: string,
    data?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const fullUrl = this.baseUrl ? new URL(url, this.baseUrl).toString() : url;
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryConfig.attempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(fullUrl, {
          method,
          headers: { 'Content-Type': 'application/json', ...requestHeaders },
          body: data ? JSON.stringify(data) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this.retryConfig.attempts) {
          const delay = this.retryConfig.delayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  async get<T>(url: string, params?: Record<string, string>, headers?: Record<string, string>): Promise<T> {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.requestWithRetry<T>('GET', url + queryString, undefined, headers);
  }

  async post<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.requestWithRetry<T>('POST', url, data, headers);
  }

  async put<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
    return this.requestWithRetry<T>('PUT', url, data, headers);
  }

  async delete<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.requestWithRetry<T>('DELETE', url, undefined, headers);
  }

  async request<T>(options: { method: string; url: string; data?: unknown; headers?: Record<string, string> }): Promise<T> {
    return this.requestWithRetry<T>(options.method, options.url, options.data, options.headers);
  }
}

// ============================================
// Cache helpers
// ============================================

export interface CacheOptions {
  ttlMs?: number;
  maxSize?: number;
}

export class PluginCache<K = string, V = unknown> {
  private cache = new Map<K, { value: V; expires: number }>();
  private defaultTtl: number;
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttlMs || 3600000; // 1 hour
    this.maxSize = options.maxSize || 1000;
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    // Evict oldest if at max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }

    this.cache.set(key, { value, expires: Date.now() + (ttlMs || this.defaultTtl) });
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Cleanup expired entries
  cleanup(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
}

// ============================================
// Logger helper
// ============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  prefix?: string;
  level?: LogLevel;
  format?: 'json' | 'text';
}

export class PluginLogger {
  private prefix: string;
  private level: LogLevel;
  private format: 'json' | 'text';
  private levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.level = options.level || 'info';
    this.format = options.format || 'text';
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    
    if (this.format === 'json') {
      return JSON.stringify({
        timestamp,
        level,
        message: prefix + message,
        ...meta,
      });
    }

    let msg = `${timestamp} ${level.toUpperCase()} ${prefix}${message}`;
    if (meta) msg += ` ${JSON.stringify(meta)}`;
    return msg;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) console.debug(this.formatMessage('debug', message, meta));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) console.info(this.formatMessage('info', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) console.warn(this.formatMessage('warn', message, meta));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) console.error(this.formatMessage('error', message, meta));
  }

  child(prefix: string): PluginLogger {
    return new PluginLogger({ prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix, level: this.level, format: this.format });
  }
}

// ============================================
// Config schema validation
// ============================================

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array';
    description: string;
    required?: boolean;
    default?: unknown;
    enum?: unknown[];
  };
}

export function validateConfig(config: Record<string, unknown>, schema: ConfigSchema): { valid: boolean; errors: string[]; validated: Record<string, unknown> } {
  const errors: string[] = [];
  const validated: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(schema)) {
    const value = config[key];

    if (spec.required && (value === undefined || value === null || value === '')) {
      errors.push(`Required config missing: ${key}`);
      continue;
    }

    if (value === undefined || value === null) {
      if (spec.default !== undefined) {
        validated[key] = spec.default;
      }
      continue;
    }

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== spec.type) {
      errors.push(`Config "${key}" must be ${spec.type}, got ${actualType}`);
      continue;
    }

    // Enum validation
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`Config "${key}" must be one of: ${spec.enum.join(', ')}`);
      continue;
    }

    validated[key] = value;
  }

  return { valid: errors.length === 0, errors, validated };
}

// ============================================
// Plugin builder (fluent API)
// ============================================

export interface PluginBuilderOptions {
  name: string;
  channel: string;
  displayName: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
}

export class PluginBuilder {
  private manifest: Partial<import('./plugin-types.js').PluginManifest> = {};
  private actions: import('./plugin-types.js').PluginAction[] = [];

  constructor(options: PluginBuilderOptions) {
    this.manifest = {
      name: options.name,
      channel: options.channel,
      displayName: options.displayName,
      version: options.version || '0.1.0',
      description: options.description || `Agent-Reach plugin for ${options.displayName}`,
      author: options.author || 'Unknown',
      license: options.license || 'MIT',
      keywords: ['agent-reach-plugin', 'agent-reach', options.channel],
      entryPoint: 'dist/index.js',
    };
  }

  addAction(action: Omit<import('./plugin-types.js').PluginAction, 'name'> & { name: string }): this {
    this.actions.push(action);
    return this;
  }

  setAuth(auth: import('./plugin-types.js').PluginAuth): this {
    this.manifest.auth = auth;
    return this;
  }

  setRequirements(req: import('./plugin-types.js').PluginRequirements): this {
    this.manifest.requirements = req;
    return this;
  }

  setCompat(compat: import('./plugin-types.js').PluginCompat): this {
    this.manifest.compat = compat;
    return this;
  }

  setRepository(url: string): this {
    this.manifest.repository = url;
    return this;
  }

  setHomepage(url: string): this {
    this.manifest.homepage = url;
    return this;
  }

  addKeyword(keyword: string): this {
    if (!this.manifest.keywords) this.manifest.keywords = [];
    this.manifest.keywords.push(keyword);
    return this;
  }

  build(): import('./plugin-types.js').PluginManifest {
    return {
      ...this.manifest,
      actions: this.actions,
    } as import('./plugin-types.js').PluginManifest;
  }

  generateCode(): string {
    const manifest = this.build();
    return `// Generated plugin manifest
export const manifest = ${JSON.stringify(manifest, null, 2)};
`;
  }
}

// ============================================
// Create plugin helper
// ============================================

export function createPlugin(builder: (b: PluginBuilder) => PluginBuilder) {
  const b = new PluginBuilder({ name: '', channel: '', displayName: '' });
  builder(b);
  return b.build();
}