/**
 * Plugin CLI Commands
 * agent-reach plugin <command>
 */
export interface PluginCLIOptions {
    pluginDir?: string;
    registryUrl?: string;
    npmClient?: 'npm' | 'pnpm' | 'yarn';
}
export declare function handlePluginCommand(args: string[], options?: PluginCLIOptions): Promise<void>;
//# sourceMappingURL=plugin-cli.d.ts.map