#!/usr/bin/env python3
"""Minimal Firecrawl-compatible mock, used to verify the agent-reach backend wiring
without an API key or a self-hosted stack. Serves only the two v2 endpoints the
patch calls.

    python tests/mock_firecrawl.py --port 3002 [--require-key SECRET]
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE = {"require_key": None, "calls": []}

SAMPLE = """# Example Domain

This domain is for use in illustrative examples in documents.

You may use this domain in literature without prior coordination.
"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quiet by default
        if STATE.get("verbose"):
            super().log_message(fmt, *args)

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _auth_ok(self) -> bool:
        want = STATE["require_key"]
        if not want:
            return True
        got = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        return got == want

    def do_GET(self):  # reachability probe from install.py --status
        self._json(405, {"success": False, "error": "method not allowed"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self._json(400, {"success": False, "error": "invalid json"})
            return
        STATE["calls"].append({"path": self.path, "payload": payload})

        if not self._auth_ok():
            self._json(401, {"success": False, "error": "Unauthorized: invalid API key"})
            return

        if self.path.endswith("/v2/scrape"):
            url = payload.get("url", "")
            if not url:
                self._json(400, {"success": False, "error": "url is required"})
                return
            if "blocked" in url:
                # Firecrawl refuses some sites by policy; callers must fall back.
                self._json(403, {"success": False,
                                 "error": "We do not support this site."})
                return
            if "fail" in url:
                self._json(500, {"success": False, "error": "scrape failed upstream"})
                return
            self._json(200, {
                "success": True,
                "data": {
                    "markdown": SAMPLE,
                    "metadata": {
                        "title": "Example Domain",
                        "sourceURL": url,
                        "statusCode": 200,
                        "language": "en",
                    },
                },
            })
            return

        if self.path.endswith("/v2/map"):
            url = payload.get("url", "")
            limit = int(payload.get("limit") or 10)
            links = [f"{url.rstrip('/')}/page-{i}" for i in range(1, min(limit, 10) + 1)]
            self._json(200, {"success": True, "data": {"links": links}})
            return

        if self.path.endswith("/v2/search"):
            limit = int(payload.get("limit") or 2)
            rows = [
                {
                    "url": f"https://example.com/{i}",
                    "title": f"Example result {i}",
                    "description": f"Description for result {i}",
                    "markdown": f"# Result {i}\n\nBody text for result {i}.",
                    "publishedDate": "2026-10-01",
                }
                for i in range(1, min(limit, 5) + 1)
            ]
            self._json(200, {"success": True, "data": {"web": rows}})
            return

        self._json(404, {"success": False, "error": "unknown endpoint"})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=3002)
    ap.add_argument("--require-key", default=None)
    ap.add_argument("--verbose", action="store_true")
    ns = ap.parse_args()
    STATE["require_key"] = ns.require_key
    STATE["verbose"] = ns.verbose
    server = ThreadingHTTPServer(("127.0.0.1", ns.port), Handler)
    print(f"mock firecrawl on http://127.0.0.1:{ns.port} (key required: {bool(ns.require_key)})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
