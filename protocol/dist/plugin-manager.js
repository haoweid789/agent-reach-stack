/**
 * Agent-Reach Plugin Manager
 * Handles plugin discovery, installation, loading, and execution
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { CHANNEL_DEFINITIONS } from './channel-definitions.js';
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
// Default directories
const DEFAULT_PLUGIN_DIR = join(process.cwd(), 'plugins');
const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
// In-memory plugin store
const loadedPlugins = new Map();
const pluginConfigs = new Map();
// ============================================
// Plugin Discovery & Installation
// ============================================
// Standalone HTTP request function for plugin context
async function pluginHttpRequest(method, url, body, options) {
    const controller = new AbortController();
    const timeout = options?.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...options?.headers },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const responseType = options?.responseType || 'json';
        let data;
        if (responseType === 'json')
            data = await response.json();
        else if (responseType === 'text')
            data = await response.text();
        else
            data = await response.arrayBuffer();
        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data,
        };
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export class PluginManager {
    pluginDir;
    registryUrl;
    npmClient;
    installedPlugins = new Map();
    constructor(options = {}) {
        this.pluginDir = options.pluginDir || DEFAULT_PLUGIN_DIR;
        this.registryUrl = options.registryUrl || DEFAULT_REGISTRY_URL;
        this.npmClient = options.npmClient || 'npm';
        if (!existsSync(this.pluginDir)) {
            mkdirSync(this.pluginDir, { recursive: true });
        }
        this.loadInstalledManifests();
    }
    loadInstalledManifests() {
        try {
            const dirs = readdirSync(this.pluginDir, { withFileTypes: true });
            for (const dirent of dirs) {
                if (dirent.isDirectory()) {
                    const manifestPath = join(this.pluginDir, dirent.name, 'plugin.json');
                    if (existsSync(manifestPath)) {
                        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
                        this.installedPlugins.set(manifest.channel, manifest);
                    }
                }
            }
        }
        catch (error) {
            console.error('[PluginManager] Failed to load installed manifests:', error);
        }
    }
    /**
     * Search for plugins on npm registry
     */
    async search(query, page = 1, pageSize = 20) {
        // Use npm registry search API
        const searchUrl = `${this.registryUrl}/-/v1/search?text=${encodeURIComponent(query)}&size=${pageSize}&from=${(page - 1) * pageSize}`;
        try {
            const response = await fetch(searchUrl);
            const data = await response.json();
            // Filter for agent-reach plugins
            const plugins = data.objects
                .filter(obj => obj.package.name.startsWith('@agent-reach/plugin-') ||
                obj.package.keywords?.includes('agent-reach-plugin'))
                .map(obj => ({
                name: obj.package.name,
                version: obj.package.version,
                description: obj.package.description,
                channel: obj.package.name.replace('@agent-reach/plugin-', ''),
                displayName: obj.package.name,
                author: obj.package.author?.name || 'unknown',
                keywords: obj.package.keywords || [],
                updatedAt: new Date().toISOString(),
                manifest: {}, // Would need separate fetch
            }));
            return { plugins, total: data.total, page, pageSize };
        }
        catch (error) {
            console.error('[PluginManager] Search failed:', error);
            return { plugins: [], total: 0, page, pageSize };
        }
    }
    /**
     * Install a plugin from npm
     */
    async install(packageName, version) {
        const spec = version ? `${packageName}@${version}` : packageName;
        console.error(`[PluginManager] Installing ${spec}...`);
        // Use npm to install
        const { spawnSync } = await import('node:child_process');
        const result = spawnSync(this.npmClient, ['install', '--prefix', this.pluginDir, spec], {
            encoding: 'utf-8',
            stdio: 'pipe',
        });
        if (result.status !== 0) {
            throw new Error(`Failed to install ${spec}: ${result.stderr}`);
        }
        // Find the installed package and read manifest
        const packageDir = this.findPackageDir(packageName);
        if (!packageDir) {
            throw new Error(`Installed package not found: ${packageName}`);
        }
        const manifestPath = join(packageDir, 'plugin.json');
        if (!existsSync(manifestPath)) {
            throw new Error(`Plugin manifest not found in ${packageDir}`);
        }
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        // Validate manifest
        this.validateManifest(manifest);
        // Save manifest copy for quick access
        writeFileSync(join(this.pluginDir, `${manifest.channel}.json`), JSON.stringify(manifest, null, 2));
        this.installedPlugins.set(manifest.channel, manifest);
        console.error(`[PluginManager] Installed ${manifest.displayName} (${manifest.channel}) v${manifest.version}`);
        return manifest;
    }
    /**
     * Uninstall a plugin
     */
    async uninstall(channel) {
        const manifest = this.installedPlugins.get(channel);
        if (!manifest) {
            throw new Error(`Plugin not installed: ${channel}`);
        }
        // Unload if loaded
        if (loadedPlugins.has(channel)) {
            await this.unload(channel);
        }
        // Remove package
        const packageDir = this.findPackageDir(`@agent-reach/plugin-${channel}`);
        if (packageDir && existsSync(packageDir)) {
            rmSync(packageDir, { recursive: true, force: true });
        }
        // Remove manifest copy
        const manifestFile = join(this.pluginDir, `${channel}.json`);
        if (existsSync(manifestFile)) {
            rmSync(manifestFile, { force: true });
        }
        this.installedPlugins.delete(channel);
        console.error(`[PluginManager] Uninstalled ${channel}`);
    }
    /**
     * List installed plugins
     */
    list() {
        return Array.from(this.installedPlugins.values());
    }
    /**
     * Get plugin manifest by channel
     */
    getManifest(channel) {
        return this.installedPlugins.get(channel);
    }
    /**
     * Load a plugin into memory
     */
    async load(channel) {
        if (loadedPlugins.has(channel)) {
            return loadedPlugins.get(channel);
        }
        const manifest = this.installedPlugins.get(channel);
        if (!manifest) {
            throw new Error(`Plugin not installed: ${channel}`);
        }
        const packageDir = this.findPackageDir(`@agent-reach/plugin-${channel}`);
        if (!packageDir) {
            throw new Error(`Package directory not found for ${channel}`);
        }
        const entryPath = join(packageDir, manifest.entryPoint);
        if (!existsSync(entryPath)) {
            throw new Error(`Entry point not found: ${entryPath}`);
        }
        // Load the plugin module
        const module = await import(entryPath);
        const plugin = module.default;
        // Validate plugin structure
        this.validatePlugin(plugin, manifest);
        // Initialize plugin context
        const context = this.createPluginContext(manifest, packageDir);
        // Call onLoad hook
        if (plugin.onLoad) {
            await plugin.onLoad(context);
        }
        loadedPlugins.set(channel, plugin);
        console.error(`[PluginManager] Loaded plugin: ${manifest.displayName} (${channel})`);
        return plugin;
    }
    /**
     * Unload a plugin
     */
    async unload(channel) {
        const plugin = loadedPlugins.get(channel);
        if (!plugin)
            return;
        const manifest = this.installedPlugins.get(channel);
        if (manifest) {
            const context = this.createPluginContext(manifest, this.findPackageDir(`@agent-reach/plugin-${channel}`) || '');
            if (plugin.onUnload) {
                await plugin.onUnload(context);
            }
        }
        loadedPlugins.delete(channel);
        console.error(`[PluginManager] Unloaded plugin: ${channel}`);
    }
    /**
     * Execute a plugin action
     */
    async execute(channel, actionName, params) {
        let plugin = loadedPlugins.get(channel);
        if (!plugin) {
            plugin = await this.load(channel);
        }
        const manifest = this.installedPlugins.get(channel);
        const packageDir = this.findPackageDir(`@agent-reach/plugin-${channel}`) || '';
        const context = this.createPluginContext(manifest, packageDir);
        return plugin.execute(actionName, params, context);
    }
    /**
     * Get all available channel definitions (built-in + plugins)
     */
    getAllChannels() {
        const channels = [...CHANNEL_DEFINITIONS];
        for (const [channel, manifest] of this.installedPlugins) {
            // Check if already exists (built-in)
            if (!CHANNEL_DEFINITIONS.find(c => c.id === channel)) {
                channels.push(this.manifestToChannelDef(manifest));
            }
        }
        return channels;
    }
    /**
     * Get all tools for MCP (built-in + plugins)
     */
    getAllTools() {
        const tools = [];
        // Built-in channels
        for (const channel of CHANNEL_DEFINITIONS) {
            for (const action of channel.actions) {
                tools.push(this.actionToTool(channel.id, action));
            }
        }
        // Plugin channels
        for (const [channel, manifest] of this.installedPlugins) {
            for (const action of manifest.actions) {
                tools.push(this.pluginActionToTool(channel, action));
            }
        }
        return tools;
    }
    /**
     * Get all skills for A2A (built-in + plugins)
     */
    getAllSkills() {
        const skills = [];
        for (const channel of CHANNEL_DEFINITIONS) {
            for (const action of channel.actions) {
                skills.push({
                    id: `${channel.id}_${action.name}`,
                    name: `${channel.name} - ${action.description}`,
                    description: `[${channel.name}] ${action.description}. Parameters: ${action.params.map(p => p.name).join(', ')}`,
                    tags: [channel.id, action.name, 'search', 'read', 'data-retrieval'],
                });
            }
        }
        for (const [channel, manifest] of this.installedPlugins) {
            for (const action of manifest.actions) {
                skills.push({
                    id: `${channel}_${action.name}`,
                    name: `${manifest.displayName} - ${action.description}`,
                    description: `[${manifest.displayName}] ${action.description}. Parameters: ${action.params.map(p => p.name).join(', ')}`,
                    tags: [channel, action.name, 'search', 'read', 'data-retrieval'],
                });
            }
        }
        return skills;
    }
    // ============================================
    // Private Helpers
    // ============================================
    findPackageDir(packageName) {
        // Check node_modules in pluginDir
        const nodeModules = join(this.pluginDir, 'node_modules');
        if (!existsSync(nodeModules))
            return null;
        // Handle scoped packages
        if (packageName.startsWith('@')) {
            const [scope, name] = packageName.split('/');
            const scopedDir = join(nodeModules, scope);
            if (existsSync(scopedDir)) {
                const packageDir = join(scopedDir, name);
                if (existsSync(packageDir))
                    return packageDir;
            }
        }
        else {
            const packageDir = join(nodeModules, packageName);
            if (existsSync(packageDir))
                return packageDir;
        }
        return null;
    }
    validateManifest(manifest) {
        if (!manifest.name || !manifest.channel || !manifest.version) {
            throw new Error('Invalid manifest: missing required fields (name, channel, version)');
        }
        if (!manifest.actions || manifest.actions.length === 0) {
            throw new Error('Invalid manifest: at least one action required');
        }
        if (manifest.channel !== manifest.name.replace('@agent-reach/plugin-', '')) {
            console.warn(`[PluginManager] Warning: channel "${manifest.channel}" doesn't match package name`);
        }
    }
    validatePlugin(plugin, manifest) {
        if (!plugin.execute || typeof plugin.execute !== 'function') {
            throw new Error('Plugin must export an execute function');
        }
        if (plugin.manifest.channel !== manifest.channel) {
            throw new Error('Plugin manifest channel mismatch');
        }
    }
    createPluginContext(manifest, packageDir) {
        const dataDir = join(this.pluginDir, '.data', manifest.channel);
        if (!existsSync(dataDir))
            mkdirSync(dataDir, { recursive: true });
        const config = pluginConfigs.get(manifest.channel) || {};
        return {
            pluginDir: packageDir,
            dataDir,
            config,
            logger: {
                debug: (msg, meta) => console.debug(`[${manifest.channel}] ${msg}`, meta || ''),
                info: (msg, meta) => console.info(`[${manifest.channel}] ${msg}`, meta || ''),
                warn: (msg, meta) => console.warn(`[${manifest.channel}] ${msg}`, meta || ''),
                error: (msg, meta) => console.error(`[${manifest.channel}] ${msg}`, meta || ''),
            },
            httpClient: {
                async get(url, options) { return pluginHttpRequest('GET', url, undefined, options); },
                async post(url, data, options) { return pluginHttpRequest('POST', url, data, options); },
                // request method signature matches PluginHttpClient interface
                async request(options) { return pluginHttpRequest('GET', '', undefined, options); },
            },
            cache: new MapCache(dataDir),
        };
    }
    async httpRequest(method, url, body, options) {
        const controller = new AbortController();
        const timeout = options?.timeout || 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...options?.headers },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            const responseType = options?.responseType || 'json';
            let data;
            if (responseType === 'json')
                data = await response.json();
            else if (responseType === 'text')
                data = await response.text();
            else
                data = await response.arrayBuffer();
            return {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                data,
            };
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    manifestToChannelDef(manifest) {
        return {
            id: manifest.channel,
            name: manifest.displayName,
            description: manifest.description,
            actions: manifest.actions.map(a => ({
                name: a.name,
                description: a.description,
                params: a.params.map(p => ({
                    name: p.name,
                    type: (p.type === 'array' || p.type === 'object') ? 'string' : p.type, // Simplify for schema
                    description: p.description,
                    required: p.required,
                    default: p.default,
                })),
            })),
        };
    }
    actionToTool(channelId, action) {
        const properties = {};
        const required = [];
        for (const param of action.params) {
            properties[param.name] = {
                type: param.type,
                description: param.description,
                ...(param.default !== undefined ? { default: param.default } : {}),
            };
            if (param.required)
                required.push(param.name);
        }
        return {
            name: `${channelId}_${action.name}`,
            description: `[${channelId}] ${action.description}`,
            inputSchema: { type: 'object', properties, required, additionalProperties: false },
        };
    }
    pluginActionToTool(channelId, action) {
        const properties = {};
        const required = [];
        for (const param of action.params) {
            properties[param.name] = {
                type: (param.type === 'array' || param.type === 'object') ? 'string' : param.type,
                description: param.description,
                ...(param.default !== undefined ? { default: param.default } : {}),
            };
            if (param.required)
                required.push(param.name);
        }
        return {
            name: `${channelId}_${action.name}`,
            description: `[${channelId}] ${action.description}`,
            inputSchema: { type: 'object', properties, required, additionalProperties: false },
        };
    }
}
// ============================================
// Simple file-based cache implementation
// ============================================
class MapCache {
    cache = new Map();
    dataDir;
    constructor(dataDir) {
        this.dataDir = dataDir;
    }
    async get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlMs = 3600000) {
        this.cache.set(key, { value, expires: Date.now() + ttlMs });
    }
    async delete(key) {
        this.cache.delete(key);
    }
    async clear() {
        this.cache.clear();
    }
}
// ============================================
// Singleton instance
// ============================================
let pluginManagerInstance = null;
export function getPluginManager(options) {
    if (!pluginManagerInstance) {
        pluginManagerInstance = new PluginManager(options);
    }
    return pluginManagerInstance;
}
export function resetPluginManager() {
    pluginManagerInstance = null;
}
//# sourceMappingURL=plugin-manager.js.map