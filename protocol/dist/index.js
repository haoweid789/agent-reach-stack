/**
 * Agent-Reach MCP Server
 * Exposes 14 platform channels as MCP tools
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { CHANNEL_DEFINITIONS } from './channel-definitions.js';
import { executeChannelAction, executeAutoRead, listChannels, checkAgentReach, getVersion } from './cli-wrapper.js';
const SERVER_NAME = 'agent-reach';
const SERVER_VERSION = '1.0.0';
/**
 * Tool annotations, as defined by the MCP spec. Clients use them as hints when
 * deciding whether to auto-approve a call, so they must describe what the tool
 * actually does rather than what would be convenient.
 *
 * Every channel action shells out to `agent-reach <channel> <action>`, which only
 * reads from a remote platform: nothing is written locally, nothing is posted or
 * deleted upstream. Hence readOnlyHint everywhere and destructiveHint nowhere.
 *
 * idempotentHint is false on purpose. Scraping the same URL twice returns
 * different data as the underlying page, search index or price moves, so the
 * result of a repeated call is not the declared result of the first call.
 */
const NETWORK_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
};
/** Local introspection only: reads the channel catalog out of this process. */
const LOCAL_ANNOTATIONS = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
/** "hot_posts" -> "Hot posts", for the human-facing tool title. */
function humanizeAction(name) {
    const spaced = name.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
// Build MCP tool definitions from channel definitions
function buildTools() {
    const tools = [];
    for (const channel of CHANNEL_DEFINITIONS) {
        for (const action of channel.actions) {
            const properties = {};
            const required = [];
            for (const param of action.params) {
                properties[param.name] = {
                    type: param.type,
                    description: param.description,
                    ...(param.default !== undefined ? { default: param.default } : {}),
                };
                if (param.required) {
                    required.push(param.name);
                }
            }
            // Add optional backend parameter for all tools
            properties.backend = {
                type: 'string',
                description: 'Specific backend to use (e.g., "gh", "api", "bili-cli"). Omit for auto-fallback.',
                enum: getBackendsForChannel(channel.id),
            };
            // Not required
            tools.push({
                name: `${channel.id}_${action.name}`,
                title: `${channel.name}: ${humanizeAction(action.name)}`,
                description: `[${channel.name}] ${action.description}`,
                annotations: NETWORK_ANNOTATIONS,
                inputSchema: {
                    type: 'object',
                    properties: properties,
                    required,
                    additionalProperties: false,
                },
            });
        }
    }
    // Add auto-read tool for any URL
    tools.push({
        name: 'auto_read',
        title: 'Auto read any URL',
        description: 'Automatically detect platform from URL and read content (agent-reach read <url>)',
        annotations: NETWORK_ANNOTATIONS,
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Any supported URL (GitHub, Bilibili, YouTube, Twitter, etc.)' },
                backend: { type: 'string', description: 'Specific backend to use' },
            },
            required: ['url'],
            additionalProperties: false,
        },
    });
    // Add list channels tool
    tools.push({
        name: 'list_channels',
        title: 'List channels',
        description: 'List all available channels with their actions and parameters',
        annotations: LOCAL_ANNOTATIONS,
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'boolean', description: 'Return human-readable text instead of JSON', default: false },
            },
            additionalProperties: false,
        },
    });
    return tools;
}
// Map channel IDs to their known backends
function getBackendsForChannel(channelId) {
    const backendMap = {
        github: ['gh', 'api'],
        bilibili: ['bili-cli'],
        youtube: ['yt-dlp', 'api'],
        twitter: ['opencli', 'api'],
        reddit: ['browser', 'api'],
        xiaohongshu: ['browser'],
        v2ex: ['api'],
        xueqiu: ['browser', 'api'],
        xiaoyuzhou: ['groq'],
        linkedin: ['browser', 'opencli'],
        boss: ['opencli'],
        instagram: ['browser'],
        facebook: ['browser'],
        // Real web backends, in chain order. `firecrawl` is only registered when the
        // optional backend patch is installed and configured; leaving it in the
        // enum is harmless because the CLI ignores an unknown label and falls back.
        web: ['firecrawl', 'jina', 'exa'],
    };
    return backendMap[channelId] || ['auto'];
}
// Build MCP resources
function buildResources() {
    return [
        {
            uri: 'agent-reach://channels',
            name: 'Channel List',
            description: 'List of all available channels with their actions and parameters',
            mimeType: 'application/json',
        },
        {
            uri: 'agent-reach://capabilities',
            name: 'Capabilities',
            description: 'Declared capabilities and limitations for each platform',
            mimeType: 'application/json',
        },
        {
            uri: 'agent-reach://status',
            name: 'Status',
            description: 'Current agent-reach installation status and version',
            mimeType: 'application/json',
        },
    ];
}
// Build MCP prompts
function buildPrompts() {
    return [
        {
            name: 'search_github_repos',
            description: 'Search GitHub repositories for a topic',
            arguments: [
                { name: 'query', description: 'Search query', required: true },
                { name: 'limit', description: 'Max results', required: false },
            ],
        },
        {
            name: 'watch_bilibili_video',
            description: 'Get Bilibili video details and subtitles',
            arguments: [
                { name: 'url_or_bv', description: 'Video URL or BV ID', required: true },
                { name: 'include_subtitle', description: 'Also fetch subtitles', required: false },
            ],
        },
        {
            name: 'search_xiaohongshu_notes',
            description: 'Search Xiaohongshu notes for a topic',
            arguments: [
                { name: 'query', description: 'Search query', required: true },
                { name: 'limit', description: 'Max results', required: false },
            ],
        },
        {
            name: 'get_youtube_transcript',
            description: 'Get full transcript of a YouTube video',
            arguments: [
                { name: 'url_or_id', description: 'Video URL or ID', required: true },
            ],
        },
        {
            name: 'search_v2ex_topics',
            description: 'Search V2EX topics in a node',
            arguments: [
                { name: 'node', description: 'Node name (e.g., "python", "go", "javascript")', required: true },
                { name: 'limit', description: 'Max topics', required: false },
            ],
        },
        {
            name: 'get_stock_quote',
            description: 'Get real-time stock quote from Xueqiu',
            arguments: [
                { name: 'symbol', description: 'Stock symbol (e.g., "AAPL", "00700.HK")', required: true },
            ],
        },
        {
            name: 'search_linkedin_jobs',
            description: 'Search LinkedIn job postings',
            arguments: [
                { name: 'query', description: 'Job search query', required: true },
                { name: 'location', description: 'Location filter', required: false },
                { name: 'limit', description: 'Max results', required: false },
            ],
        },
        {
            name: 'search_boss_jobs',
            description: 'Search BOSS Zhipin job postings',
            arguments: [
                { name: 'query', description: 'Job search query', required: true },
                { name: 'city', description: 'City code', required: false },
                { name: 'limit', description: 'Max results', required: false },
            ],
        },
    ];
}
async function main() {
    // Verify agent-reach is available
    console.error('[Agent-Reach MCP] Checking agent-reach installation...');
    const available = await checkAgentReach();
    if (!available) {
        console.error('[Agent-Reach MCP] WARNING: agent-reach not found or not working. Tools will fail.');
        console.error('[Agent-Reach MCP] Install with: curl -fsSL https://raw.githubusercontent.com/Panniantong/Agent-Reach/main/install.sh | bash');
    }
    else {
        const version = await getVersion();
        console.error(`[Agent-Reach MCP] agent-reach v${version} detected`);
    }
    // Create MCP server
    const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {}, resources: {}, prompts: {} } });
    // Register tools
    const tools = buildTools();
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            // Handle special tools
            if (name === 'auto_read') {
                const { url, backend } = args;
                const result = await executeAutoRead(url, backend);
                return formatToolResult(result);
            }
            if (name === 'list_channels') {
                const { text } = args;
                const result = await listChannels(text);
                return formatToolResult(result);
            }
            // Parse channel_action format
            const match = name.match(/^([a-z]+)_(.+)$/);
            if (!match) {
                throw new Error(`Unknown tool: ${name}`);
            }
            const [, channelId, actionName] = match;
            const { backend, ...params } = args;
            const result = await executeChannelAction(channelId, actionName, params, backend);
            return formatToolResult(result);
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    });
    // Register resources
    const resources = buildResources();
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources }));
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params;
        if (uri === 'agent-reach://channels') {
            const result = await listChannels(false);
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        if (uri === 'agent-reach://capabilities') {
            // Return capabilities from skill
            const capabilities = {
                channels: CHANNEL_DEFINITIONS.map((c) => ({
                    id: c.id,
                    name: c.name,
                    actions: c.actions.map((a) => ({ name: a.name, description: a.description })),
                })),
                notes: [
                    'Read-only: no posting, commenting, liking, or messaging',
                    'No credential handling: user must login via agent-reach login <channel>',
                    'Public content prioritized: uses native tools first, Reach fills gaps',
                    'Rate limits respected: RATE_LIMITED errors mean wait and retry',
                    'Platform blocks respected: PLATFORM_BLOCKED means user must handle in browser',
                ],
            };
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify(capabilities, null, 2),
                    },
                ],
            };
        }
        if (uri === 'agent-reach://status') {
            const available = await checkAgentReach();
            const version = await getVersion();
            return {
                contents: [
                    {
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({ available, version, channels: CHANNEL_DEFINITIONS.length, tools: tools.length }, null, 2),
                    },
                ],
            };
        }
        throw new Error(`Unknown resource: ${uri}`);
    });
    // Register prompts
    const prompts = buildPrompts();
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts }));
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const promptHandlers = {
            search_github_repos: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Search GitHub repositories for: ${args?.query || ''}` },
                    },
                ],
            }),
            watch_bilibili_video: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Get Bilibili video details for: ${args?.url_or_bv || ''}${args?.include_subtitle ? ' (include subtitles)' : ''}` },
                    },
                ],
            }),
            search_xiaohongshu_notes: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Search Xiaohongshu notes for: ${args?.query || ''}` },
                    },
                ],
            }),
            get_youtube_transcript: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Get YouTube transcript for: ${args?.url_or_id || ''}` },
                    },
                ],
            }),
            search_v2ex_topics: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Search V2EX topics in node: ${args?.node || ''}` },
                    },
                ],
            }),
            get_stock_quote: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Get stock quote for: ${args?.symbol || ''}` },
                    },
                ],
            }),
            search_linkedin_jobs: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Search LinkedIn jobs: ${args?.query || ''}${args?.location ? ` in ${args.location}` : ''}` },
                    },
                ],
            }),
            search_boss_jobs: async () => ({
                messages: [
                    {
                        role: 'user',
                        content: { type: 'text', text: `Search BOSS Zhipin jobs: ${args?.query || ''}${args?.city ? ` in ${args.city}` : ''}` },
                    },
                ],
            }),
        };
        const handler = promptHandlers[name];
        if (!handler) {
            throw new Error(`Unknown prompt: ${name}`);
        }
        return handler();
    });
    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Agent-Reach MCP] Server started on stdio');
}
function formatToolResult(result) {
    if (!result.ok) {
        const error = result.error;
        let message = `Error (${error?.code || 'UNKNOWN'}): ${error?.message || 'Unknown error'}`;
        if (error?.hint)
            message += `\nHint: ${error.hint}`;
        if (error?.retry_after_seconds)
            message += `\nRetry after: ${error.retry_after_seconds}s`;
        return { content: [{ type: 'text', text: message }], isError: true };
    }
    const items = result.items || [];
    if (items.length === 0) {
        return { content: [{ type: 'text', text: 'No results found.' }] };
    }
    // Format items as readable text
    const lines = items.map((item, i) => {
        const parts = [];
        if (item.title)
            parts.push(`**${item.title}**`);
        if (item.url)
            parts.push(item.url);
        if (item.author)
            parts.push(`by ${item.author}`);
        if (item.published_at)
            parts.push(`@ ${item.published_at}`);
        if (item.text)
            parts.push(item.text.slice(0, 500) + (item.text.length > 500 ? '...' : ''));
        return `${i + 1}. ${parts.join(' | ')}`;
    });
    let output = lines.join('\n\n');
    // Report which backend served this call. Without it a caller cannot tell a
    // Firecrawl fetch from a Jina/Exa fallback, which is the first thing to check
    // when a page looks different between runs.
    if (result.backend) {
        output = `[backend: ${result.backend}]\n\n${output}`;
    }
    if (result.meta?.update) {
        output += `\n\n---\n🔔 **Update available**: v${result.meta.update.latest} (current: v${result.meta.update.current})\nChanges: ${result.meta.update.notes.join('; ')}`;
    }
    return { content: [{ type: 'text', text: output }] };
}
main().catch((err) => {
    console.error('[Agent-Reach MCP] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map