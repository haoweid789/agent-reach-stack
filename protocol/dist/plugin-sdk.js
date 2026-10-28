/**
 * Agent-Reach Plugin SDK
 * npm package: @agent-reach/plugin-sdk
 * Third-party developers use this to build plugins
 */
// Re-export all types
export * from './plugin-types.js';
export function createPluginResult(items, meta) {
    return {
        ok: true,
        items: items.map(item => ({
            ...item,
            published_at: item.published_at instanceof Date ? item.published_at.toISOString() : item.published_at,
        })),
        meta,
    };
}
export function createPluginError(code, message, hint, retryAfterSeconds) {
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
};
export class PluginHttpClient {
    baseUrl;
    defaultHeaders;
    timeout;
    retryConfig;
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
        this.defaultHeaders = options.defaultHeaders || {};
        this.timeout = options.timeout || 30000;
        this.retryConfig = options.retry || { attempts: 3, delayMs: 1000, backoffMultiplier: 2 };
    }
    async requestWithRetry(method, url, data, headers) {
        const fullUrl = this.baseUrl ? new URL(url, this.baseUrl).toString() : url;
        const requestHeaders = { ...this.defaultHeaders, ...headers };
        let lastError = null;
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
                return await response.json();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < this.retryConfig.attempts) {
                    const delay = this.retryConfig.delayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError || new Error('Request failed after retries');
    }
    async get(url, params, headers) {
        const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
        return this.requestWithRetry('GET', url + queryString, undefined, headers);
    }
    async post(url, data, headers) {
        return this.requestWithRetry('POST', url, data, headers);
    }
    async put(url, data, headers) {
        return this.requestWithRetry('PUT', url, data, headers);
    }
    async delete(url, headers) {
        return this.requestWithRetry('DELETE', url, undefined, headers);
    }
    async request(options) {
        return this.requestWithRetry(options.method, options.url, options.data, options.headers);
    }
}
export class PluginCache {
    cache = new Map();
    defaultTtl;
    maxSize;
    constructor(options = {}) {
        this.defaultTtl = options.ttlMs || 3600000; // 1 hour
        this.maxSize = options.maxSize || 1000;
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        // Evict oldest if at max size
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined)
                this.cache.delete(firstKey);
        }
        this.cache.set(key, { value, expires: Date.now() + (ttlMs || this.defaultTtl) });
    }
    delete(key) {
        return this.cache.delete(key);
    }
    has(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
    // Cleanup expired entries
    cleanup() {
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
export class PluginLogger {
    prefix;
    level;
    format;
    levels = { debug: 0, info: 1, warn: 2, error: 3 };
    constructor(options = {}) {
        this.prefix = options.prefix || '';
        this.level = options.level || 'info';
        this.format = options.format || 'text';
    }
    shouldLog(level) {
        return this.levels[level] >= this.levels[this.level];
    }
    formatMessage(level, message, meta) {
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
        if (meta)
            msg += ` ${JSON.stringify(meta)}`;
        return msg;
    }
    debug(message, meta) {
        if (this.shouldLog('debug'))
            console.debug(this.formatMessage('debug', message, meta));
    }
    info(message, meta) {
        if (this.shouldLog('info'))
            console.info(this.formatMessage('info', message, meta));
    }
    warn(message, meta) {
        if (this.shouldLog('warn'))
            console.warn(this.formatMessage('warn', message, meta));
    }
    error(message, meta) {
        if (this.shouldLog('error'))
            console.error(this.formatMessage('error', message, meta));
    }
    child(prefix) {
        return new PluginLogger({ prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix, level: this.level, format: this.format });
    }
}
export function validateConfig(config, schema) {
    const errors = [];
    const validated = {};
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
export class PluginBuilder {
    manifest = {};
    actions = [];
    constructor(options) {
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
    addAction(action) {
        this.actions.push(action);
        return this;
    }
    setAuth(auth) {
        this.manifest.auth = auth;
        return this;
    }
    setRequirements(req) {
        this.manifest.requirements = req;
        return this;
    }
    setCompat(compat) {
        this.manifest.compat = compat;
        return this;
    }
    setRepository(url) {
        this.manifest.repository = url;
        return this;
    }
    setHomepage(url) {
        this.manifest.homepage = url;
        return this;
    }
    addKeyword(keyword) {
        if (!this.manifest.keywords)
            this.manifest.keywords = [];
        this.manifest.keywords.push(keyword);
        return this;
    }
    build() {
        return {
            ...this.manifest,
            actions: this.actions,
        };
    }
    generateCode() {
        const manifest = this.build();
        return `// Generated plugin manifest
export const manifest = ${JSON.stringify(manifest, null, 2)};
`;
    }
}
// ============================================
// Create plugin helper
// ============================================
export function createPlugin(builder) {
    const b = new PluginBuilder({ name: '', channel: '', displayName: '' });
    builder(b);
    return b.build();
}
//# sourceMappingURL=plugin-sdk.js.map