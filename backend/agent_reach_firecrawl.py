# -*- coding: utf-8 -*-
"""Firecrawl backend for agent-reach's `web` channel.

Adds Firecrawl (https://github.com/firecrawl/firecrawl) as the FIRST backend of
`agent-reach web read` and `agent-reach web search`, ahead of Jina/Exa.

Why a patch module instead of editing agent_reach/channels/web.py:
  the installed package gets replaced by `agent-reach update`, so any edit there
  is lost. This module is imported at agent-reach startup by a .pth hook and
  rewires the WebChannel action table in place; the original Jina/Exa backends
  stay intact as the fallback chain.

Install (see install.py): the .pth file drops one import line into site-packages,
so every `agent-reach` invocation loads this module before dispatch runs.

Configuration (first hit wins):
  1. env  FC_BASE_URL / FIRECRAWL_BASE_URL   -- e.g. http://localhost:3002
  2. env  FC_API_KEY  / FIRECRAWL_API_KEY    -- omitted for unauthenticated self-host
  3. file ~/.agent-reach/firecrawl.json      -- {"base_url": ..., "api_key": ...}

When nothing is configured the backend reports NEED_SETUP and the dispatcher
falls through to Jina/Exa, so behavior without Firecrawl is unchanged.
"""

from __future__ import annotations

import json
import os
import urllib.error
from pathlib import Path

from agent_reach.runtime.result import (
    BAD_INPUT,
    NEED_SETUP,
    RATE_LIMITED,
    UPSTREAM_BROKEN,
    ReachError,
    make_item,
)
from agent_reach.runtime.run import http_request
from agent_reach.utils.url import normalize_public_http_url

_ENV_BASE = ("FC_BASE_URL", "FIRECRAWL_BASE_URL")
_ENV_KEY = ("FC_API_KEY", "FIRECRAWL_API_KEY")
_CONFIG_PATH = Path(os.path.expanduser("~")) / ".agent-reach" / "firecrawl.json"

_DEFAULT_HOSTED = "https://api.firecrawl.dev"
_MAX_RESPONSE_BYTES = 8 * 1024 * 1024
_ERROR_SNIPPET = 400

#: Firecrawl answers 403/451 for sites it refuses by policy ("we do not support
#: this site", paywalled/blocked domains). These are upstream limits, not caller
#: mistakes, so the chain must keep going instead of treating them as final.
_UNSUPPORTED_SITE_CODES = frozenset({403, 451})


# ── configuration ────────────────────────────────────────────────────────────

def _config_file() -> dict:
    try:
        raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _setting(name: str, env_names: tuple, default=None):
    for key in env_names:
        value = os.environ.get(key, "").strip()
        if value:
            return value
    value = _config_file().get(name)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return default


def _base_url() -> str | None:
    """Configured base URL, or None when Firecrawl was never set up."""
    base = _setting("base_url", _ENV_BASE)
    if base:
        return base.rstrip("/")
    # A bare API key means the hosted service; no key at all means "not configured".
    return _DEFAULT_HOSTED if _setting("api_key", _ENV_KEY) else None


def _api_key() -> str | None:
    return _setting("api_key", _ENV_KEY)


def _endpoint(action: str) -> str:
    base = _base_url()
    if not base:
        raise ReachError(
            NEED_SETUP,
            "Firecrawl is not configured",
            hint=(
                "Set FC_BASE_URL (self-hosted, e.g. http://localhost:3002) or FC_API_KEY "
                "(hosted), then retry. Skipping to the next web backend."
            ),
        )
    return f"{base}/v2/{action}"


# ── transport ────────────────────────────────────────────────────────────────

def _post(action: str, payload: dict, timeout: float) -> dict:
    """POST to Firecrawl and return the parsed JSON body.

    Errors carry a ReachError code the dispatcher understands: BAD_INPUT and
    RATE_LIMITED are final (stop the chain), everything else falls through to
    Jina/Exa.
    """
    url = _endpoint(action)
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    key = _api_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    body = json.dumps(payload).encode("utf-8")
    try:
        raw = http_request(url, timeout=timeout, data=body, headers=headers,
                           max_bytes=_MAX_RESPONSE_BYTES)
    except urllib.error.HTTPError as exc:
        detail = _read_error(exc)
        if exc.code == 401:
            raise ReachError(BAD_INPUT, f"Firecrawl rejected the API key: {detail}",
                             hint="Check FC_API_KEY.") from None
        if exc.code == 402:
            raise ReachError(RATE_LIMITED, f"Firecrawl credits exhausted: {detail}",
                             hint="Top up the Firecrawl plan or unset FC_API_KEY to skip it.") from None
        if exc.code == 429:
            raise ReachError(RATE_LIMITED, f"Firecrawl rate limited: {detail}",
                             hint="Wait before retrying this channel.") from None
        if exc.code in _UNSUPPORTED_SITE_CODES:
            # 403/451: Firecrawl declines this site by policy, not a malformed
            # request. Classifying it BAD_INPUT would stop the chain and cost the
            # caller the Jina/Exa attempts that can still succeed.
            raise ReachError(UPSTREAM_BROKEN, f"Firecrawl will not fetch this site ({exc.code}): {detail}",
                             hint="Firecrawl declines this site; falling back to the next reader.") from None
        if 400 <= exc.code < 500:
            raise ReachError(BAD_INPUT, f"Firecrawl rejected the request ({exc.code}): {detail}") from None
        raise ReachError(UPSTREAM_BROKEN, f"Firecrawl {exc.code}: {detail}") from None
    except (TimeoutError, urllib.error.URLError) as exc:
        raise ReachError(UPSTREAM_BROKEN, f"Firecrawl unreachable at {_base_url()}: {exc}") from None
    try:
        parsed = json.loads(raw.decode("utf-8", errors="replace"))
    except ValueError:
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl returned a non-JSON body") from None
    if not isinstance(parsed, dict):
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl returned an unexpected payload")
    if parsed.get("success") is False:
        message = parsed.get("error") or parsed.get("message") or "unspecified failure"
        raise ReachError(UPSTREAM_BROKEN, f"Firecrawl: {message}")
    return parsed


def _read_error(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read(_ERROR_SNIPPET + 1).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001 - error body is best-effort
        return exc.reason or "no detail"
    try:
        parsed = json.loads(raw)
        for field in ("error", "message", "detail"):
            if isinstance(parsed.get(field), str):
                return parsed[field][:_ERROR_SNIPPET]
    except (ValueError, AttributeError):
        pass
    return raw.strip()[:_ERROR_SNIPPET] or (exc.reason or "no detail")


# ── backends ─────────────────────────────────────────────────────────────────

def _firecrawl_read(*, target: str, timeout: float) -> list:
    try:
        url = normalize_public_http_url(target)
    except ValueError:
        raise ReachError(BAD_INPUT, "target must be a public http(s) URL") from None
    payload = _post("scrape", {"url": url, "formats": ["markdown"], "onlyMainContent": True}, timeout)
    data = payload.get("data") or {}
    text = data.get("markdown") or data.get("summary") or ""
    if not isinstance(text, str) or not text.strip():
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl returned no markdown content")
    meta = data.get("metadata") or {}
    title = meta.get("title") or meta.get("ogTitle")
    return [
        make_item(
            title=title.strip() if isinstance(title, str) and title.strip() else None,
            url=meta.get("sourceURL") or meta.get("url") or url,
            text=text.strip(),
            raw={k: meta.get(k) for k in ("statusCode", "language", "publishedTime") if k in meta},
        )
    ]


def _firecrawl_map(*, target: str, limit: int, timeout: float) -> list:
    """Discover a site's URLs. Hosted /v2/map requires a key (keyless is 401)."""
    try:
        url = normalize_public_http_url(target)
    except ValueError:
        raise ReachError(BAD_INPUT, "target must be a public http(s) URL") from None
    payload = _post("map", {"url": url, "limit": max(1, min(int(limit), 500))}, timeout)
    data = payload.get("data") or {}
    rows = data.get("links") if isinstance(data, dict) else data
    if not isinstance(rows, list) or not rows:
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl map returned no links")
    items = []
    for row in rows[:limit]:
        link = row.get("url") if isinstance(row, dict) else row
        if isinstance(link, str) and link.strip():
            items.append(make_item(url=link.strip(), text=""))
    if not items:
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl map returned no usable URLs")
    return items


def _firecrawl_search(*, query: str, limit: int, timeout: float) -> list:
    payload = _post(
        "search",
        {"query": query, "limit": limit, "sources": [{"type": "web"}],
         "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True}},
        timeout,
    )
    data = payload.get("data")
    rows = data.get("web") if isinstance(data, dict) else data
    if not isinstance(rows, list) or not rows:
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl returned no recognizable search results")
    items = []
    for row in rows[:limit]:
        if not isinstance(row, dict):
            continue
        text = row.get("markdown") or row.get("description") or row.get("snippet") or ""
        items.append(
            make_item(
                title=(row.get("title") or None),
                url=(row.get("url") or None),
                published_at=(row.get("publishedDate") or row.get("published_at") or None),
                text=text.strip() if isinstance(text, str) else "",
            )
        )
    if not items:
        raise ReachError(UPSTREAM_BROKEN, "Firecrawl returned no usable search rows")
    return items


# ── patch ────────────────────────────────────────────────────────────────────

def apply() -> bool:
    """Insert Firecrawl ahead of Jina/Exa on the web channel. Idempotent.

    Nothing is inserted while Firecrawl is unconfigured, so an install with no
    base URL / key behaves exactly like stock agent-reach: `agent-reach channels`
    keeps listing jina/exa only and no per-call NEED_SETUP attempt is recorded.
    """
    try:
        from agent_reach.channels.web import WebChannel
    except Exception:  # noqa: BLE001 - agent_reach not importable in this interpreter
        return False

    if not _base_url():
        return False
    if getattr(WebChannel, "_firecrawl_patched", False):
        return True
    def _prepend(action_name: str, label: str, method: str) -> None:
        current = WebChannel.actions
        rebuilt = []
        for action in current:
            if action.name == action_name:
                chain = tuple(b for b in action.backends if b[0] != label)
                rebuilt.append(
                    type(action)(
                        name=action.name,
                        help=action.help,
                        params=action.params,
                        backends=((label, method),) + chain,
                        live_test=action.live_test,
                        timeout=action.timeout,
                        public_web=action.public_web,
                    )
                )
            else:
                rebuilt.append(action)
        WebChannel.actions = tuple(rebuilt)

    _prepend("read", "firecrawl", "_firecrawl_read")
    _prepend("search", "firecrawl", "_firecrawl_search")
    WebChannel._firecrawl_read = staticmethod(_firecrawl_read)
    WebChannel._firecrawl_search = staticmethod(_firecrawl_search)
    WebChannel._firecrawl_patched = True

    # `map` is new surface (stock agent-reach has no URL-discovery action), so it
    # is appended as a Firecrawl-only action rather than prepended to a chain.
    from agent_reach.channels.base import Action, Param

    if not any(a.name == "map" for a in WebChannel.actions):
        WebChannel._firecrawl_map = staticmethod(_firecrawl_map)
        WebChannel.actions = WebChannel.actions + (
            Action(
                "map",
                "List the URLs of a site (Firecrawl /v2/map; needs an API key)",
                (
                    Param("target", "site URL"),
                    Param("limit", "max URLs", required=False, type=int, default=50),
                ),
                (("firecrawl", "_firecrawl_map"),),
            ),
        )
    return True


def _self_heal() -> None:
    """Repair a launcher left stale by `agent-reach update`.

    update reinstalls both the package and the zipapp, so this process may be
    running from the *new* launcher with the hook already gone. Repairing here
    keeps the next invocation correct without the user noticing. Runs once per
    process, never raises, and is skipped when the install directory is gone.
    """
    try:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parent
        if not (root / "install.py").is_file():
            return
        if str(root) not in sys.path:
            sys.path.insert(0, str(root))
        import install as _installer  # local sibling module, not the stdlib one

        _installer.heal(quiet=True)
    except Exception:  # noqa: BLE001 - self-heal must never break a read
        pass


apply()
_self_heal()
