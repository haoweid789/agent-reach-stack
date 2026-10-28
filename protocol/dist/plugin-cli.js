/**
 * Plugin CLI Commands
 * agent-reach plugin <command>
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { getPluginManager } from './plugin-manager.js';
const require = createRequire(import.meta.url);
const { spawnSync } = require('node:child_process');
export async function handlePluginCommand(args, options = {}) {
    const manager = getPluginManager(options);
    const subcommand = args[0];
    switch (subcommand) {
        case 'search':
            await cmdSearch(manager, args.slice(1));
            break;
        case 'install':
            await cmdInstall(manager, args.slice(1));
            break;
        case 'uninstall':
        case 'remove':
            await cmdUninstall(manager, args.slice(1));
            break;
        case 'list':
        case 'ls':
            await cmdList(manager, args.slice(1));
            break;
        case 'info':
            await cmdInfo(manager, args.slice(1));
            break;
        case 'create':
            await cmdCreate(args.slice(1));
            break;
        case 'publish':
            await cmdPublish(args.slice(1));
            break;
        case 'update':
            await cmdUpdate(manager, args.slice(1));
            break;
        default:
            printPluginHelp();
            process.exit(1);
    }
}
async function cmdSearch(manager, args) {
    const query = args[0] || 'agent-reach-plugin';
    const page = parseInt(args[1]) || 1;
    console.error(`[Plugin] Searching for: ${query}`);
    const result = await manager.search(query, page);
    if (result.plugins.length === 0) {
        console.log('No plugins found.');
        return;
    }
    console.log(`Found ${result.total} plugins (page ${result.page}):\n`);
    for (const plugin of result.plugins) {
        console.log(`  ${plugin.name}@${plugin.version}`);
        console.log(`    ${plugin.description}`);
        console.log(`    Channel: ${plugin.channel} | Author: ${plugin.author}`);
        console.log('');
    }
}
async function cmdInstall(manager, args) {
    if (args.length === 0) {
        console.error('Usage: agent-reach plugin install <package-name>[@version]');
        process.exit(1);
    }
    const [packageName, version] = args[0].split('@');
    try {
        const manifest = await manager.install(packageName, version);
        console.log(`✅ Installed ${manifest.displayName} (${manifest.channel}) v${manifest.version}`);
        console.log(`   ${manifest.description}`);
        console.log(`   Actions: ${manifest.actions.map(a => a.name).join(', ')}`);
    }
    catch (error) {
        console.error(`❌ Install failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
async function cmdUninstall(manager, args) {
    if (args.length === 0) {
        console.error('Usage: agent-reach plugin uninstall <channel>');
        process.exit(1);
    }
    const channel = args[0];
    try {
        await manager.uninstall(channel);
        console.log(`✅ Uninstalled ${channel}`);
    }
    catch (error) {
        console.error(`❌ Uninstall failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
async function cmdList(manager, _args) {
    const plugins = manager.list();
    if (plugins.length === 0) {
        console.log('No plugins installed.');
        return;
    }
    console.log('Installed plugins:\n');
    for (const plugin of plugins) {
        console.log(`  ${plugin.displayName} (${plugin.channel}) v${plugin.version}`);
        console.log(`    ${plugin.description}`);
        console.log(`    Actions: ${plugin.actions.map(a => a.name).join(', ')}`);
        console.log(`    Author: ${plugin.author} | License: ${plugin.license}`);
        console.log('');
    }
}
async function cmdInfo(manager, args) {
    if (args.length === 0) {
        console.error('Usage: agent-reach plugin info <channel>');
        process.exit(1);
    }
    const manifest = manager.getManifest(args[0]);
    if (!manifest) {
        console.error(`Plugin not found: ${args[0]}`);
        process.exit(1);
    }
    console.log(JSON.stringify(manifest, null, 2));
}
async function cmdCreate(args) {
    if (args.length === 0) {
        console.error('Usage: agent-reach plugin create <channel-name> [--template=basic|full]');
        process.exit(1);
    }
    const channelName = args[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const template = args.find(a => a.startsWith('--template='))?.split('=')[1] || 'basic';
    const packageName = `@agent-reach/plugin-${channelName}`;
    const displayName = channelName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const templateDir = template === 'full' ? 'template-full' : 'template-basic';
    console.error(`[Plugin] Creating ${packageName} from ${template} template...`);
    // Create directory structure
    const { mkdirSync, writeFileSync, copyFileSync, existsSync } = require('node:fs');
    const { join, dirname } = require('node:path');
    const { fileURLToPath } = require('node:url');
    // Determine the base directory for plugin creation
    // Use process.cwd() which is the directory from which the command was run
    const baseDir = process.cwd();
    const targetDir = join(baseDir, packageName);
    if (existsSync(targetDir)) {
        console.error(`Directory already exists: ${targetDir}`);
        process.exit(1);
    }
    mkdirSync(join(targetDir, 'src'), { recursive: true });
    mkdirSync(join(targetDir, 'test'), { recursive: true });
    // Generate plugin.json (manifest)
    const manifest = {
        name: packageName,
        version: '0.1.0',
        channel: channelName,
        displayName: displayName,
        description: `Agent-Reach plugin for ${displayName}`,
        author: 'Your Name <your@email.com>',
        license: 'MIT',
        repository: `https://github.com/yourusername/${packageName}`,
        homepage: `https://github.com/yourusername/${packageName}#readme`,
        keywords: ['agent-reach-plugin', 'agent-reach', channelName],
        entryPoint: 'dist/index.js',
        actions: [
            {
                name: 'search',
                description: `Search ${displayName}`,
                params: [
                    { name: 'query', type: 'string', description: 'Search query', required: true },
                    { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
                ],
                examples: [`Search ${displayName} for "example"`],
            },
            {
                name: 'read',
                description: `Read ${displayName} content`,
                params: [
                    { name: 'target', type: 'string', description: 'Content ID or URL', required: true },
                ],
                examples: [`Read ${displayName} content by ID`],
            },
        ],
        auth: { type: 'none', required: false },
        requirements: { node: '>=18.0.0' },
        compat: { agentReach: '>=1.6.0 <2.0.0' },
    };
    writeFileSync(join(targetDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
    // Generate package.json
    const packageJson = {
        name: packageName,
        version: '0.1.0',
        description: manifest.description,
        type: 'module',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
        files: ['dist', 'plugin.json'],
        scripts: {
            build: 'tsc',
            dev: 'tsx watch src/index.ts',
            test: 'node --test test/**/*.test.js',
            prepublishOnly: 'npm run build',
        },
        keywords: manifest.keywords,
        author: manifest.author,
        license: manifest.license,
        repository: { type: 'git', url: manifest.repository },
        homepage: manifest.homepage,
        dependencies: {},
        devDependencies: {
            '@agent-reach/plugin-sdk': 'workspace:*',
            '@types/node': '^22.0.0',
            'tsx': '^4.19.0',
            'typescript': '^5.6.0',
        },
        engines: { node: '>=18.0.0' },
    };
    writeFileSync(join(targetDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    // Generate tsconfig.json
    const tsconfig = {
        compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            lib: ['ES2022'],
            outDir: './dist',
            rootDir: './src',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            declaration: true,
            declarationMap: true,
            sourceMap: true,
            resolveJsonModule: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist', 'test'],
    };
    writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    // Generate src/index.ts (main plugin entry)
    const pluginCode = `/**
 * ${manifest.displayName} Plugin for Agent-Reach
 * Generated by agent-reach plugin create
 */

import { PluginModule, PluginContext, PluginResult, PluginItem } from '@agent-reach/plugin-sdk';

const manifest = {
  name: '${manifest.name}',
  version: '${manifest.version}',
  channel: '${manifest.channel}',
  displayName: '${manifest.displayName}',
  description: '${manifest.description}',
  author: '${manifest.author}',
  license: '${manifest.license}',
  entryPoint: '${manifest.entryPoint}',
  actions: ${JSON.stringify(manifest.actions, null, 2)},
  auth: ${JSON.stringify(manifest.auth, null, 2)},
  requirements: ${JSON.stringify(manifest.requirements, null, 2)},
  compat: ${JSON.stringify(manifest.compat, null, 2)},
};

const plugin: PluginModule = {
  manifest,
  
  async onLoad(context: PluginContext) {
    context.logger.info('${manifest.displayName} plugin loaded');
    // Initialize any connections, load config, etc.
  },
  
  async onUnload(context: PluginContext) {
    context.logger.info('${manifest.displayName} plugin unloaded');
    // Cleanup connections, save state, etc.
  },
  
  async execute(actionName: string, params: Record<string, unknown>, context: PluginContext): Promise<PluginResult> {
    context.logger.debug(\`Executing \${actionName}\`, params);
    
    switch (actionName) {
      case 'search':
        return search(params, context);
      case 'read':
        return read(params, context);
      default:
        return { ok: false, error: { code: 'UNKNOWN_ACTION', message: \`Unknown action: \${actionName}\` } };
    }
  },
};

// ============================================
// Action Implementations
// ============================================

async function search(params: Record<string, unknown>, context: PluginContext): Promise<PluginResult> {
  const query = params.query as string;
  const limit = (params.limit as number) || 10;
  
  context.logger.info(\`Searching for: \${query}\`);
  
  // TODO: Implement actual search logic
  // Example using context.httpClient:
  // const response = await context.httpClient.get('https://api.example.com/search', { params: { q: query, limit } });
  // const items = transformResults(response.data);
  
  // Placeholder results
  const items: PluginItem[] = [
    {
      title: \`Example result for "\${query}"\`,
      url: 'https://example.com/result-1',
      author: 'example-author',
      published_at: new Date().toISOString(),
      text: 'This is a placeholder result. Replace with actual implementation.',
      raw: { query, source: '${manifest.channel}' },
    },
  ];
  
  return { ok: true, items };
}

async function read(params: Record<string, unknown>, context: PluginContext): Promise<PluginResult> {
  const target = params.target as string;
  
  context.logger.info(\`Reading: \${target}\`);
  
  // TODO: Implement actual read logic
  // const response = await context.httpClient.get(\`https://api.example.com/content/\${target}\`);
  
  // Placeholder result
  const items: PluginItem[] = [
    {
      title: \`Content for \${target}\`,
      url: target,
      author: 'example-author',
      published_at: new Date().toISOString(),
      text: 'This is a placeholder content. Replace with actual implementation.',
      raw: { target, source: '${manifest.channel}' },
    },
  ];
  
  return { ok: true, items };
}

export default plugin;
`;
    writeFileSync(join(targetDir, 'src', 'index.ts'), pluginCode);
    // Generate test file
    const testCode = `import { test } from 'node:test';
import assert from 'node:assert';
import plugin from '../src/index.js';

test('plugin manifest is valid', () => {
  assert.ok(plugin.manifest);
  assert.equal(plugin.manifest.channel, '${manifest.channel}');
  assert.ok(plugin.manifest.actions.length > 0);
});

test('plugin exports execute function', () => {
  assert.equal(typeof plugin.execute, 'function');
});
`;
    writeFileSync(join(targetDir, 'test', 'plugin.test.js'), testCode);
    // Generate README.md
    const readme = `# ${manifest.displayName} Plugin for Agent-Reach

\`\`\`bash
npm install ${packageName}
\`\`\`

## Actions

${manifest.actions.map(a => `- **${a.name}**: ${a.description}`).join('\n')}

## Installation

\`\`\`bash
# Via agent-reach CLI
agent-reach plugin install ${packageName}

# Or manually
npm install ${packageName}
agent-reach plugin load ${channelName}
\`\`\`

## Usage

### MCP Tools
After loading, the following tools will be available:
${manifest.actions.map(a => `- \`${channelName}_${a.name}\``).join('\n')}

### A2A Skills
Available as A2A skills:
${manifest.actions.map(a => `- \`${channelName}_${a.name}\``).join('\n')}

### Direct API
\`\`\`typescript
import { getPluginManager } from '@agent-reach/mcp-server';

const manager = getPluginManager();
await manager.load('${channelName}');
const result = await manager.execute('${channelName}', 'search', { query: 'example', limit: 5 });
\`\`\`

## Development

\`\`\`bash
npm install
npm run dev      # Watch mode
npm run build    # Build for publishing
npm test         # Run tests
\`\`\`

## Publishing

\`\`\`bash
npm publish --access public
\`\`\`

Then users can install with:
\`\`\`bash
agent-reach plugin install ${packageName}
\`\`\`
`;
    writeFileSync(join(targetDir, 'README.md'), readme);
    // Generate .gitignore
    const gitignore = `node_modules/
dist/
*.log
.env
.DS_Store
`;
    writeFileSync(join(targetDir, '.gitignore'), gitignore);
    console.log(`✅ Created plugin template at: ${targetDir}`);
    console.log('');
    console.log('Next steps:');
    console.log(`  cd ${packageName}`);
    console.log('  npm install');
    console.log('  # Edit src/index.ts to implement your actions');
    console.log('  npm run build');
    console.log('  npm publish --access public');
}
async function cmdPublish(args) {
    const packageDir = args[0] || process.cwd();
    const { existsSync } = require('node:fs');
    if (!existsSync(join(packageDir, 'package.json'))) {
        console.error('No package.json found in directory');
        process.exit(1);
    }
    console.error(`[Plugin] Publishing ${packageDir}...`);
    const result = spawnSync('npm', ['publish', '--access', 'public'], {
        cwd: packageDir,
        encoding: 'utf-8',
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        console.error('Publish failed');
        process.exit(1);
    }
    console.log('✅ Published successfully!');
}
async function cmdUpdate(manager, args) {
    const channel = args[0];
    if (!channel) {
        // Update all
        const plugins = manager.list();
        for (const plugin of plugins) {
            try {
                console.error(`[Plugin] Updating ${plugin.channel}...`);
                await manager.install(`@agent-reach/plugin-${plugin.channel}`);
            }
            catch (error) {
                console.error(`Failed to update ${plugin.channel}: ${error}`);
            }
        }
        console.log('✅ All plugins updated');
    }
    else {
        // Update specific
        try {
            console.error(`[Plugin] Updating ${channel}...`);
            const manifest = await manager.install(`@agent-reach/plugin-${channel}`);
            console.log(`✅ Updated ${manifest.displayName} to v${manifest.version}`);
        }
        catch (error) {
            console.error(`❌ Update failed: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    }
}
function printPluginHelp() {
    console.log(`
Agent-Reach Plugin Manager

Usage: agent-reach plugin <command> [options]

Commands:
  search <query> [page]     Search for plugins on npm registry
  install <pkg@version>     Install a plugin from npm
  uninstall <channel>       Uninstall a plugin
  list, ls                  List installed plugins
  info <channel>            Show plugin details
  create <channel-name>     Create a new plugin template
  publish [dir]             Publish plugin to npm
  update [channel]          Update plugin(s)

Examples:
  agent-reach plugin search zhihu
  agent-reach plugin install @agent-reach/plugin-zhihu
  agent-reach plugin install @agent-reach/plugin-zhihu@1.0.0
  agent-reach plugin uninstall zhihu
  agent-reach plugin list
  agent-reach plugin create zhihu --template=basic
  agent-reach plugin create notion --template=full
  agent-reach plugin publish ./my-plugin
  agent-reach plugin update
  agent-reach plugin update zhihu
`);
}
// Main entry point for CLI
async function main() {
    // Parse command line arguments
    // process.argv[0] = node, process.argv[1] = script path
    // So process.argv.slice(2) gives us the actual arguments
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printPluginHelp();
        process.exit(0);
    }
    try {
        await handlePluginCommand(args, {});
    }
    catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
// Run if this is the main module
// Use a more reliable check that works with both absolute and relative paths
const isMainModule = (() => {
    try {
        return import.meta.url.startsWith('file:') &&
            import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
    }
    catch {
        // Fallback: check if the script path matches
        return process.argv[1].endsWith('plugin-cli.js');
    }
})();
if (isMainModule) {
    await main();
}
//# sourceMappingURL=plugin-cli.js.map