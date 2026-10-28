/**
 * Agent-Reach Plugin Manager
 * Handles plugin discovery, installation, loading, and execution
 */
import { PluginManifest, PluginModule, PluginResult, PluginSearchResult } from './plugin-types.js';
import { ChannelDefinition } from './channel-definitions.js';
export interface PluginManagerOptions {
    pluginDir?: string;
    registryUrl?: string;
    npmClient?: 'npm' | 'pnpm' | 'yarn';
}
export declare class PluginManager {
    private pluginDir;
    private registryUrl;
    private npmClient;
    private installedPlugins;
    constructor(options?: PluginManagerOptions);
    private loadInstalledManifests;
    /**
     * Search for plugins on npm registry
     */
    search(query: string, page?: number, pageSize?: number): Promise<PluginSearchResult>;
    /**
     * Install a plugin from npm
     */
    install(packageName: string, version?: string): Promise<PluginManifest>;
    /**
     * Uninstall a plugin
     */
    uninstall(channel: string): Promise<void>;
    /**
     * List installed plugins
     */
    list(): PluginManifest[];
    /**
     * Get plugin manifest by channel
     */
    getManifest(channel: string): PluginManifest | undefined;
    /**
     * Load a plugin into memory
     */
    load(channel: string): Promise<PluginModule>;
    /**
     * Unload a plugin
     */
    unload(channel: string): Promise<void>;
    /**
     * Execute a plugin action
     */
    execute(channel: string, actionName: string, params: Record<string, unknown>): Promise<PluginResult>;
    /**
     * Get all available channel definitions (built-in + plugins)
     */
    getAllChannels(): ChannelDefinition[];
    /**
     * Get all tools for MCP (built-in + plugins)
     */
    getAllTools(): Array<{
        name: string;
        description: string;
        inputSchema: object;
    }>;
    /**
     * Get all skills for A2A (built-in + plugins)
     */
    getAllSkills(): Array<{
        id: string;
        name: string;
        description: string;
        tags: string[];
    }>;
    private findPackageDir;
    private validateManifest;
    private validatePlugin;
    private createPluginContext;
    private httpRequest;
    private manifestToChannelDef;
    private actionToTool;
    private pluginActionToTool;
}
export declare function getPluginManager(options?: PluginManagerOptions): PluginManager;
export declare function resetPluginManager(): void;
//# sourceMappingURL=plugin-manager.d.ts.map