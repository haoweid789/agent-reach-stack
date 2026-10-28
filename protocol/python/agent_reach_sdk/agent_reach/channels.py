"""Agent-Reach channel catalog.

Canonical list of the 14 built-in platforms and their actions.
Generated from ``packages/sdk/src/channels.ts`` - the TypeScript and
Python SDKs share one catalog so every surface exposes the same tools.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

__all__ = [
    "ActionParam",
    "ChannelAction",
    "ChannelDefinition",
    "CHANNEL_DEFINITIONS",
    "get_channel",
    "get_action",
    "get_all_tool_names",
]


@dataclass(frozen=True)
class ActionParam:
    """A single parameter of a channel action."""

    name: str
    type: str
    description: str
    required: bool
    default: Any = None


@dataclass(frozen=True)
class ChannelAction:
    """An action exposed by a channel, e.g. ``search`` or ``read``."""

    name: str
    description: str
    params: List[ActionParam] = field(default_factory=list)


@dataclass(frozen=True)
class ChannelDefinition:
    """A platform, e.g. GitHub or Bilibili."""

    id: str
    name: str
    description: str
    actions: List[ChannelAction] = field(default_factory=list)


CHANNEL_DEFINITIONS: List[ChannelDefinition] = [
    ChannelDefinition(
        id='github',
        name='GitHub',
        description='Search repositories, read repos/issues/PRs with comments',
        actions=[
            ChannelAction(
                name='search',
                description='Search GitHub repositories',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query (e.g., "react hooks")',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results to return',
                        required=False,
                        default=5,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read a repository (with README) or an issue/PR (with comments)',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='owner/repo, or a repo/issue/PR URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='bilibili',
        name='Bilibili',
        description='Search videos, read video details, get trending, fetch subtitles',
        actions=[
            ChannelAction(
                name='search',
                description='Search Bilibili videos',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Get video title, uploader, description, and stats',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='BV ID or video URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='hot',
                description='Get trending videos',
                params=[
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='subtitle',
                description='Get subtitle text of the first video part (may need login)',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='BV ID or video URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='youtube',
        name='YouTube',
        description='Search videos, read video details, get transcripts/subtitles',
        actions=[
            ChannelAction(
                name='search',
                description='Search YouTube videos',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Get video title, channel, description, and stats',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Video ID or URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='subtitle',
                description='Get subtitle tracks list',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Video ID or URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='transcribe',
                description='Get full transcript text (uses yt-dlp/Whisper)',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Video ID or URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='twitter',
        name='Twitter/X',
        description='Search tweets, read profiles, get tweet threads',
        actions=[
            ChannelAction(
                name='search',
                description='Search tweets',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='profile',
                description='Get user profile info',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Username or profile URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='tweets',
                description='Get user tweets',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Username or profile URL',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum tweets',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='thread',
                description='Get full tweet thread',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Tweet URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='reddit',
        name='Reddit',
        description='Search posts, read subreddits, get post details',
        actions=[
            ChannelAction(
                name='search',
                description='Search Reddit posts',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read a post with comments',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Post URL or subreddit/post-id',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='subreddit',
                description='Get subreddit posts',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Subreddit name (e.g., "programming")',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum posts',
                        required=False,
                        default=10,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='xiaohongshu',
        name='Xiaohongshu (Little Red Book)',
        description='Search notes, read note details, get comments',
        actions=[
            ChannelAction(
                name='search',
                description='Search notes',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read note text, author, and top-level comments',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Note ID or URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='comments',
                description='Get comments for a note',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Note ID or URL',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum comments',
                        required=False,
                        default=20,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='v2ex',
        name='V2EX',
        description='Get hot topics, read nodes, read topics, get user info',
        actions=[
            ChannelAction(
                name='hot',
                description='Get hot topics',
                params=[
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum topics',
                        required=False,
                        default=20,
                    ),
                ],
            ),
            ChannelAction(
                name='node',
                description='Get topics from a node',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Node name (e.g., "python", "go")',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum topics',
                        required=False,
                        default=20,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read a topic with replies',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Topic ID or URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='user',
                description='Get user profile',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Username or profile URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='xueqiu',
        name='Xueqiu (雪球)',
        description='Get stock quotes, search posts, get hot posts/stocks',
        actions=[
            ChannelAction(
                name='quote',
                description='Get real-time stock quote',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Stock symbol (e.g., "AAPL", "00700.HK")',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='search',
                description='Search posts/stocks',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='hot_posts',
                description='Get hot posts',
                params=[
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum posts',
                        required=False,
                        default=20,
                    ),
                ],
            ),
            ChannelAction(
                name='hot_stocks',
                description='Get hot stocks',
                params=[
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum stocks',
                        required=False,
                        default=20,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='xiaoyuzhou',
        name='Xiaoyuzhou (小宇宙)',
        description='Transcribe podcast episodes',
        actions=[
            ChannelAction(
                name='transcribe',
                description='Transcribe full podcast episode (requires Groq API key)',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Episode URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='linkedin',
        name='LinkedIn',
        description='Search jobs, read job details',
        actions=[
            ChannelAction(
                name='jobs',
                description='Search job postings',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Job search query',
                        required=True,
                    ),
                    ActionParam(
                        name='location',
                        type='string',
                        description='Location (optional)',
                        required=False,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read job description',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Job URL or ID',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='boss',
        name='BOSS Zhipin (直聘)',
        description='Search jobs, read job details',
        actions=[
            ChannelAction(
                name='search',
                description='Search job postings',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Job search query',
                        required=True,
                    ),
                    ActionParam(
                        name='city',
                        type='string',
                        description='City code (optional)',
                        required=False,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read job description with readable salary',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Job URL',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='instagram',
        name='Instagram',
        description='Search users, get profile, get posts',
        actions=[
            ChannelAction(
                name='search',
                description='Search users',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='profile',
                description='Get user profile',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Username or profile URL',
                        required=True,
                    ),
                ],
            ),
            ChannelAction(
                name='posts',
                description='Get user posts',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Username or profile URL',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum posts',
                        required=False,
                        default=10,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='facebook',
        name='Facebook',
        description='Search pages, get page profiles',
        actions=[
            ChannelAction(
                name='search',
                description='Search pages',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='profile',
                description='Get page profile',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='Page URL or ID',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
    ChannelDefinition(
        id='web',
        name='Web (General)',
        description='Anonymous web search and read (fallback for any URL)',
        actions=[
            ChannelAction(
                name='search',
                description='Anonymous web search',
                params=[
                    ActionParam(
                        name='query',
                        type='string',
                        description='Search query',
                        required=True,
                    ),
                    ActionParam(
                        name='limit',
                        type='number',
                        description='Maximum results',
                        required=False,
                        default=10,
                    ),
                ],
            ),
            ChannelAction(
                name='read',
                description='Read any public URL',
                params=[
                    ActionParam(
                        name='target',
                        type='string',
                        description='URL to read',
                        required=True,
                    ),
                ],
            ),
        ],
    ),
]


def get_channel(channel_id: str) -> Optional[ChannelDefinition]:
    """Look up a channel definition by ID."""
    for channel in CHANNEL_DEFINITIONS:
        if channel.id == channel_id:
            return channel
    return None


def get_action(channel_id: str, action_name: str) -> Optional[ChannelAction]:
    """Look up an action definition within a channel."""
    channel = get_channel(channel_id)
    if channel is None:
        return None
    for action in channel.actions:
        if action.name == action_name:
            return action
    return None


def get_all_tool_names() -> List[str]:
    """Every tool name exposed by the catalog, e.g. ``github_search``."""
    return [
        f"{channel.id}_{action.name}"
        for channel in CHANNEL_DEFINITIONS
        for action in channel.actions
    ]
