#!/usr/bin/env python3
"""Unified installer for agent-reach-stack.

Installs both layers in order:

  1. backend/  - patches the agent-reach CLI so Firecrawl joins the web chain
  2. protocol/ - builds the MCP / A2A server that exposes the CLI as tools

The layers are independent: either can be skipped, and the protocol layer works
on a stock agent-reach CLI. The backend layer needs no Node at all.

    python install.py                  # install both
    python install.py --backend-only
    python install.py --protocol-only
    python install.py --skip-build     # protocol: reuse the committed dist/
    python install.py --status
    python install.py --uninstall
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
PROTOCOL = ROOT / "protocol"

OK = "[ok]  "
WARN = "[warn]"
FAIL = "[fail]"


def _run(args, cwd=None, timeout=900):
    # Resolve bare command names via PATHEXT (npm is npm.cmd on Windows;
    # CreateProcess does not do that resolution itself).
    argv = list(args)
    if not Path(argv[0]).is_file():
        resolved = shutil.which(argv[0])
        if resolved:
            argv[0] = resolved
    try:
        p = subprocess.run(argv, cwd=str(cwd) if cwd else None,
                           capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 127, f"not found: {args[0]}"
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s: {' '.join(args)}"


def _node_major():
    if not shutil.which("node"):
        return None
    code, out = _run(["node", "--version"], timeout=30)
    if code != 0:
        return None
    try:
        return int(out.strip().lstrip("v").split(".")[0])
    except ValueError:
        return None


def install_backend():
    print("\n=== backend layer (Firecrawl -> agent-reach web chain) ===")
    code, out = _run([sys.executable, "install.py"], cwd=BACKEND, timeout=300)
    print(out.rstrip())
    if code != 0:
        print(f"{FAIL} backend install failed (exit {code})")
        return False
    return True


def backend_status():
    code, out = _run([sys.executable, "install.py", "--status"], cwd=BACKEND, timeout=300)
    print(out.rstrip())
    return code == 0


def uninstall_backend():
    print("\n=== backend layer ===")
    code, out = _run([sys.executable, "install.py", "--uninstall"], cwd=BACKEND, timeout=300)
    print(out.rstrip())


def _protocol_deps_ready():
    return (PROTOCOL / "node_modules").is_dir() and (
        PROTOCOL / "node_modules" / "@modelcontextprotocol").is_dir()


def install_protocol(skip_build=False):
    print("\n=== protocol layer (MCP / A2A / Plugin server) ===")
    major = _node_major()
    if major is None:
        print(f"{FAIL} Node.js not found - the protocol layer needs Node 20+")
        print("       Install it from https://nodejs.org, or run with --backend-only")
        return False
    if major < 20:
        print(f"{FAIL} Node {major} is too old - the protocol layer needs Node 20+")
        return False
    print(f"{OK} Node {major}")

    if not _protocol_deps_ready():
        print("    installing npm dependencies ...")
        code, out = _run(["npm", "install", "--silent"], cwd=PROTOCOL)
        if code != 0:
            print(f"{FAIL} npm install failed\n{out[-1500:]}")
            return False
        print(f"{OK} dependencies installed")
    else:
        print(f"{OK} dependencies present")

    dist = PROTOCOL / "dist" / "index.js"
    if skip_build:
        print(f"{OK} build skipped (--skip-build)")
    else:
        print("    building TypeScript ...")
        code, out = _run(["npm", "run", "build"], cwd=PROTOCOL)
        if code != 0:
            print(f"{FAIL} build failed\n{out[-2000:]}")
            return False
        print(f"{OK} build complete")

    if not dist.is_file():
        print(f"{FAIL} dist/index.js missing - the server would not start")
        return False
    return True


def protocol_status():
    print("\n=== protocol layer ===")
    major = _node_major()
    print(f"node      : {major if major else '<not found>'}")
    print(f"deps      : {'present' if _protocol_deps_ready() else 'missing'}")
    dist = PROTOCOL / "dist" / "index.js"
    print(f"build     : {'present' if dist.is_file() else 'missing'}  {dist}")
    if not dist.is_file() or not _protocol_deps_ready():
        return False
    script = (
        "import('./dist/channel-definitions.js').then(m=>{"
        "const n=m.getAllToolNames();"
        "console.log(JSON.stringify({tools:n.length+1,web:n.filter(x=>x.startsWith('web_'))}))})"
    )
    code, out = _run(["node", "-e", script], cwd=PROTOCOL, timeout=60)
    if code != 0:
        print(f"{FAIL} tool table unreadable\n{out[-800:]}")
        return False
    try:
        info = json.loads(out.strip().splitlines()[-1])
        print(f"mcp tools : {info['tools']}")
        print(f"web tools : {', '.join(info['web'])}")
        return "web_map" in info["web"]
    except (ValueError, IndexError, KeyError):
        print(f"{WARN} could not parse tool table: {out[-300:]}")
        return False


def install(build_protocol=True, skip_build=False):
    ok = install_backend()
    if build_protocol:
        ok = install_protocol(skip_build=skip_build) and ok
    print("\n" + "=" * 52)
    print("Installed." if ok else "Finished with errors - see above.")
    print("""
Next:
  python install.py --status              # both layers
  agent-reach web read "https://example.com"
  node protocol/dist/index.js             # run the MCP server on stdio

Configure Firecrawl (optional; without it the chain stays jina -> exa):
  export FC_API_KEY=fc-xxxxxxxx
  export FC_BASE_URL=http://localhost:3002
""")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend-only", action="store_true")
    ap.add_argument("--protocol-only", action="store_true")
    ap.add_argument("--skip-build", action="store_true", help="protocol: reuse the committed dist/")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--uninstall", action="store_true")
    ns = ap.parse_args()

    if ns.uninstall:
        uninstall_backend()
        print("\nprotocol layer: nothing to uninstall (files + node_modules only).")
        print(f"Remove {PROTOCOL} if you want it gone.")
        return 0

    if ns.status:
        b = backend_status()
        p = protocol_status()
        print("\n" + "=" * 52)
        print(f"backend  : {'ready' if b else 'not ready'}")
        print(f"protocol : {'ready' if p else 'not ready'}")
        return 0 if (b and p) else 1

    if ns.backend_only:
        return 0 if install_backend() else 1
    if ns.protocol_only:
        return 0 if install_protocol(skip_build=ns.skip_build) else 1
    return install(build_protocol=True, skip_build=ns.skip_build)


if __name__ == "__main__":
    sys.exit(main())
