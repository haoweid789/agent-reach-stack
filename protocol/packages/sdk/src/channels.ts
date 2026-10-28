/**
 * Agent-Reach Channel Definitions (SDK)
 *
 * Canonical catalog of the 14 built-in platforms and their actions.
 * Shared by the MCP server, the A2A server and the SDK so that every
 * surface exposes exactly the same tool set.
 */

export interface ActionParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  default?: string | number | boolean;
}

export interface ChannelAction {
  name: string;
  description: string;
  params: ActionParam[];
}

export interface ChannelDefinition {
  id: string;
  name: string;
  description: string;
  actions: ChannelAction[];
}

export const CHANNEL_DEFINITIONS: ChannelDefinition[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Search repositories, read repos/issues/PRs with comments',
    actions: [
      {
        name: 'search',
        description: 'Search GitHub repositories',
        params: [
          { name: 'query', type: 'string', description: 'Search query (e.g., "react hooks")', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results to return', required: false, default: 5 },
        ],
      },
      {
        name: 'read',
        description: 'Read a repository (with README) or an issue/PR (with comments)',
        params: [
          { name: 'target', type: 'string', description: 'owner/repo, or a repo/issue/PR URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'bilibili',
    name: 'Bilibili',
    description: 'Search videos, read video details, get trending, fetch subtitles',
    actions: [
      {
        name: 'search',
        description: 'Search Bilibili videos',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Get video title, uploader, description, and stats',
        params: [
          { name: 'target', type: 'string', description: 'BV ID or video URL', required: true },
        ],
      },
      {
        name: 'hot',
        description: 'Get trending videos',
        params: [
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'subtitle',
        description: 'Get subtitle text of the first video part (may need login)',
        params: [
          { name: 'target', type: 'string', description: 'BV ID or video URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Search videos, read video details, get transcripts/subtitles',
    actions: [
      {
        name: 'search',
        description: 'Search YouTube videos',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Get video title, channel, description, and stats',
        params: [
          { name: 'target', type: 'string', description: 'Video ID or URL', required: true },
        ],
      },
      {
        name: 'subtitle',
        description: 'Get subtitle tracks list',
        params: [
          { name: 'target', type: 'string', description: 'Video ID or URL', required: true },
        ],
      },
      {
        name: 'transcribe',
        description: 'Get full transcript text (uses yt-dlp/Whisper)',
        params: [
          { name: 'target', type: 'string', description: 'Video ID or URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    description: 'Search tweets, read profiles, get tweet threads',
    actions: [
      {
        name: 'search',
        description: 'Search tweets',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'profile',
        description: 'Get user profile info',
        params: [
          { name: 'target', type: 'string', description: 'Username or profile URL', required: true },
        ],
      },
      {
        name: 'tweets',
        description: 'Get user tweets',
        params: [
          { name: 'target', type: 'string', description: 'Username or profile URL', required: true },
          { name: 'limit', type: 'number', description: 'Maximum tweets', required: false, default: 10 },
        ],
      },
      {
        name: 'thread',
        description: 'Get full tweet thread',
        params: [
          { name: 'target', type: 'string', description: 'Tweet URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    description: 'Search posts, read subreddits, get post details',
    actions: [
      {
        name: 'search',
        description: 'Search Reddit posts',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Read a post with comments',
        params: [
          { name: 'target', type: 'string', description: 'Post URL or subreddit/post-id', required: true },
        ],
      },
      {
        name: 'subreddit',
        description: 'Get subreddit posts',
        params: [
          { name: 'target', type: 'string', description: 'Subreddit name (e.g., "programming")', required: true },
          { name: 'limit', type: 'number', description: 'Maximum posts', required: false, default: 10 },
        ],
      },
    ],
  },
  {
    id: 'xiaohongshu',
    name: 'Xiaohongshu (Little Red Book)',
    description: 'Search notes, read note details, get comments',
    actions: [
      {
        name: 'search',
        description: 'Search notes',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Read note text, author, and top-level comments',
        params: [
          { name: 'target', type: 'string', description: 'Note ID or URL', required: true },
        ],
      },
      {
        name: 'comments',
        description: 'Get comments for a note',
        params: [
          { name: 'target', type: 'string', description: 'Note ID or URL', required: true },
          { name: 'limit', type: 'number', description: 'Maximum comments', required: false, default: 20 },
        ],
      },
    ],
  },
  {
    id: 'v2ex',
    name: 'V2EX',
    description: 'Get hot topics, read nodes, read topics, get user info',
    actions: [
      {
        name: 'hot',
        description: 'Get hot topics',
        params: [
          { name: 'limit', type: 'number', description: 'Maximum topics', required: false, default: 20 },
        ],
      },
      {
        name: 'node',
        description: 'Get topics from a node',
        params: [
          { name: 'target', type: 'string', description: 'Node name (e.g., "python", "go")', required: true },
          { name: 'limit', type: 'number', description: 'Maximum topics', required: false, default: 20 },
        ],
      },
      {
        name: 'read',
        description: 'Read a topic with replies',
        params: [
          { name: 'target', type: 'string', description: 'Topic ID or URL', required: true },
        ],
      },
      {
        name: 'user',
        description: 'Get user profile',
        params: [
          { name: 'target', type: 'string', description: 'Username or profile URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'xueqiu',
    name: 'Xueqiu (雪球)',
    description: 'Get stock quotes, search posts, get hot posts/stocks',
    actions: [
      {
        name: 'quote',
        description: 'Get real-time stock quote',
        params: [
          { name: 'target', type: 'string', description: 'Stock symbol (e.g., "AAPL", "00700.HK")', required: true },
        ],
      },
      {
        name: 'search',
        description: 'Search posts/stocks',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'hot_posts',
        description: 'Get hot posts',
        params: [
          { name: 'limit', type: 'number', description: 'Maximum posts', required: false, default: 20 },
        ],
      },
      {
        name: 'hot_stocks',
        description: 'Get hot stocks',
        params: [
          { name: 'limit', type: 'number', description: 'Maximum stocks', required: false, default: 20 },
        ],
      },
    ],
  },
  {
    id: 'xiaoyuzhou',
    name: 'Xiaoyuzhou (小宇宙)',
    description: 'Transcribe podcast episodes',
    actions: [
      {
        name: 'transcribe',
        description: 'Transcribe full podcast episode (requires Groq API key)',
        params: [
          { name: 'target', type: 'string', description: 'Episode URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Search jobs, read job details',
    actions: [
      {
        name: 'jobs',
        description: 'Search job postings',
        params: [
          { name: 'query', type: 'string', description: 'Job search query', required: true },
          { name: 'location', type: 'string', description: 'Location (optional)', required: false },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Read job description',
        params: [
          { name: 'target', type: 'string', description: 'Job URL or ID', required: true },
        ],
      },
    ],
  },
  {
    id: 'boss',
    name: 'BOSS Zhipin (直聘)',
    description: 'Search jobs, read job details',
    actions: [
      {
        name: 'search',
        description: 'Search job postings',
        params: [
          { name: 'query', type: 'string', description: 'Job search query', required: true },
          { name: 'city', type: 'string', description: 'City code (optional)', required: false },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Read job description with readable salary',
        params: [
          { name: 'target', type: 'string', description: 'Job URL', required: true },
        ],
      },
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Search users, get profile, get posts',
    actions: [
      {
        name: 'search',
        description: 'Search users',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'profile',
        description: 'Get user profile',
        params: [
          { name: 'target', type: 'string', description: 'Username or profile URL', required: true },
        ],
      },
      {
        name: 'posts',
        description: 'Get user posts',
        params: [
          { name: 'target', type: 'string', description: 'Username or profile URL', required: true },
          { name: 'limit', type: 'number', description: 'Maximum posts', required: false, default: 10 },
        ],
      },
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Search pages, get page profiles',
    actions: [
      {
        name: 'search',
        description: 'Search pages',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'profile',
        description: 'Get page profile',
        params: [
          { name: 'target', type: 'string', description: 'Page URL or ID', required: true },
        ],
      },
    ],
  },
  {
    id: 'web',
    name: 'Web (General)',
    description: 'Anonymous web search and read (fallback for any URL)',
    actions: [
      {
        name: 'search',
        description: 'Anonymous web search',
        params: [
          { name: 'query', type: 'string', description: 'Search query', required: true },
          { name: 'limit', type: 'number', description: 'Maximum results', required: false, default: 10 },
        ],
      },
      {
        name: 'read',
        description: 'Read any public URL',
        params: [
          { name: 'target', type: 'string', description: 'URL to read', required: true },
        ],
      },
      {
        // Provided by the Firecrawl backend patch (backend/). The CLI registers
        // this action only when Firecrawl is configured; declaring it here is
        // what makes the tool visible to MCP/A2A clients. Calling it without a
        // backend configured returns the CLI's own configuration error.
        name: 'map',
        description: 'List the URLs of a site (requires the Firecrawl backend to be configured)',
        params: [
          { name: 'target', type: 'string', description: 'Site URL to map', required: true },
          { name: 'limit', type: 'number', description: 'Maximum URLs', required: false, default: 50 },
        ],
      },
    ],
  },
];

/**
 * Get all tool names for registration
 */
export function getAllToolNames(): string[] {
  const tools: string[] = [];
  for (const channel of CHANNEL_DEFINITIONS) {
    for (const action of channel.actions) {
      tools.push(`${channel.id}_${action.name}`);
    }
  }
  return tools;
}

/**
 * Get channel definition by ID
 */
export function getChannel(id: string): ChannelDefinition | undefined {
  return CHANNEL_DEFINITIONS.find((c) => c.id === id);
}

/**
 * Get action definition
 */
export function getAction(channelId: string, actionName: string): ChannelAction | undefined {
  const channel = getChannel(channelId);
  return channel?.actions.find((a) => a.name === actionName);
}