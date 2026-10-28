"""Result formatting shared by the SDK and the framework adapters."""

from __future__ import annotations

from typing import Any, Dict, List

from .types import ReachResult

__all__ = ["format_result", "format_items"]


def format_items(items: List[Any]) -> str:
    """Render items as readable text for LLM consumption."""
    if not items:
        return "No results found."

    blocks: List[str] = []
    for index, item in enumerate(items, start=1):
        title = getattr(item, "title", "") or "(untitled)"
        url = getattr(item, "url", "") or ""
        author = getattr(item, "author", None)
        published_at = getattr(item, "published_at", None)
        text = getattr(item, "text", "") or ""

        lines = [f"{index}. {title}"]
        if url:
            lines.append(f"   {url}")
        if author:
            lines.append(f"   by {author}")
        if published_at:
            lines.append(f"   @ {published_at}")
        if text:
            truncated = text if len(text) <= 800 else text[:800] + "..."
            lines.append(f"   {truncated}")
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


def format_result(result: ReachResult) -> str:
    """Render a whole result, including errors, as text."""
    if not result.ok:
        error = result.error
        parts = [f"Error: {error.message if error else 'unknown error'}"]
        if error and error.hint:
            parts.append(f"Hint: {error.hint}")
        return "\n".join(parts)

    return format_items(result.items)
