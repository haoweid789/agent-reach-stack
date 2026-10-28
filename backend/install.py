#!/usr/bin/env python3
"""Install / uninstall the Firecrawl backend hook for agent-reach.

Uses a .pth file in site-packages so the patch imports before the CLI builds its
argument table (--backend choices are read from the action table at parse time).

    python install.py            # install
    python install.py --uninstall
    python install.py --status
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import site
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODULE = HERE / "agent_reach_firecrawl.py"
PTH_NAME = "agent_reach_firecrawl.pth"


def _site_dirs() -> list[Path]:
    dirs: list[Path] = []
    try:
        dirs.extend(Path(p) for p in site.getsitepackages())
    except AttributeError:
        pass
    user = site.getusersitepackages()
    if isinstance(user, str):
        dirs.append(Path(user))
    else:
        dirs.extend(Path(p) for p in user)
    out = []
    for d in dirs:
        if d not in out and d.is_dir():
            out.append(d)
    return out


def _agent_reach_dir() -> Path | None:
    spec = importlib.util.find_spec("agent_reach")
    return Path(spec.submodule_search_locations[0]) if spec and spec.submodule_search_locations else None


def _uv_tool_root() -> Path | None:
    """`uv tool install agent-reach` keeps its own venv; that copy is what the
    `agent-reach` on PATH resolves to. Prefer it over whatever python runs us."""
    candidates = []
    roaming = os.environ.get("APPDATA")
    if roaming:
        candidates.append(Path(roaming) / "uv" / "tools" / "agent-reach")
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidates.append(Path(local) / "uv" / "tools" / "agent-reach")
    candidates.append(Path.home() / ".local" / "share" / "uv" / "tools" / "agent-reach")
    for c in candidates:
        if (c / "Lib" / "site-packages" / "agent_reach").is_dir() or (
            c / "lib"
        ).glob("python*/site-packages/agent_reach"):
            return c
    return None


def _uv_site() -> Path | None:
    root = _uv_tool_root()
    if root is None:
        return None
    win = root / "Lib" / "site-packages"
    if win.is_dir():
        return win
    for p in sorted((root / "lib").glob("python*/site-packages")):
        if (p / "agent_reach").is_dir():
            return p
    return None


def _uv_python() -> Path | None:
    root = _uv_tool_root()
    if root is None:
        return None
    for rel in ("Scripts/python.exe", "bin/python"):
        p = root / rel
        if p.exists():
            return p
    return None


def target_site() -> Path:
    """The site-packages that the `agent-reach` on PATH actually imports from."""
    uv = _uv_site()
    if uv is not None:
        return uv
    pkg = _agent_reach_dir()
    if pkg is None:
        raise SystemExit("agent-reach is not importable; install it first (`agent-reach setup`).")
    pkg_site = pkg.parent
    for d in _site_dirs():
        if d.resolve() == pkg_site.resolve():
            return d
    return pkg_site


def _pth_path() -> Path:
    return target_site() / PTH_NAME


def _write_pth(path: Path) -> None:
    # A .pth line starting with "import " is executed by site.py at startup.
    line = f"import sys; sys.path.insert(0, {str(HERE)!r}); import agent_reach_firecrawl\n"
    path.write_text(line, encoding="utf-8")


def _launcher_path() -> Path | None:
    """The zipapp launcher that `agent-reach` on PATH resolves to.

    `uv tool install` writes a distlib zipapp that runs `agent_reach.cli:main`
    directly; site.py never processes .pth payloads for it, so the .pth alone
    does not activate the patch there.
    """
    uv_py = _uv_python()
    if uv_py is not None:
        for name in ("agent-reach.exe", "agent-reach"):
            cand = uv_py.parent / name
            if cand.is_file():
                return cand
    scripts = Path(sys.executable).parent
    for name in ("agent-reach.exe", "agent-reach"):
        cand = scripts / name
        if cand.is_file():
            return cand
    home_bin = Path.home() / ".local" / "bin"
    for name in ("agent-reach.exe", "agent-reach"):
        cand = home_bin / name
        if cand.is_file():
            return cand
    return None


def _patch_launcher(exe: Path) -> bool:
    """Rewrite the zipapp's __main__.py so the patch imports before the CLI runs."""
    import zipfile

    sys.path.insert(0, str(HERE))
    from tools.rewrite_launcher import rewrite

    marker = b"agent_reach_firecrawl"
    try:
        with zipfile.ZipFile(exe) as z:
            if "__main__.py" not in z.namelist():
                print(f"[!] {exe.name}: no __main__.py entry; .pth hook only")
                return False
            current = z.read("__main__.py")
    except (zipfile.BadZipFile, OSError) as exc:
        print(f"[!] {exe.name}: not a readable zipapp ({exc}); .pth hook only")
        return False
    if marker in current:
        print(f"[ok] launcher already patched: {exe}")
        return True

    backup = exe.with_name(exe.name + ".bak-agent-reach")
    if not backup.exists():
        backup.write_bytes(exe.read_bytes())
    try:
        rewrite(exe)
    except SystemExit as exc:
        print(f"[!] launcher rewrite failed ({exc}); .pth hook only")
        return False
    print(f"[ok] launcher patched: {exe}  (backup: {backup.name})")
    return True


def install() -> None:
    path = _pth_path()
    _write_pth(path)
    print(f"[ok] hook written: {path}")
    print(f"[ok] module path : {HERE}")
    exe = _launcher_path()
    if exe:
        _patch_launcher(exe)
    else:
        print("[-] agent-reach.exe launcher not found; .pth hook covers python entry only")
    status()


def uninstall() -> None:
    path = _pth_path()
    if path.exists():
        path.unlink()
        print(f"[ok] removed: {path}")
    else:
        print("[-] hook not installed")
    exe = _launcher_path()
    if exe:
        backup = exe.with_name(exe.name + ".bak-agent-reach")
        if backup.exists():
            exe.write_bytes(backup.read_bytes())
            backup.unlink()
            print(f"[ok] launcher restored: {exe}")
        else:
            print("[-] no launcher backup to restore")


def _launcher_needs_patch(exe: Path) -> bool:
    import zipfile

    try:
        with zipfile.ZipFile(exe) as z:
            return b"agent_reach_firecrawl" not in z.read("__main__.py")
    except Exception:  # noqa: BLE001 - unreadable counts as needing repair
        return True


def heal(quiet: bool = False) -> bool:
    """Re-apply the hook if it is missing.

    `agent-reach update` reinstalls the package and the zipapp launcher, which
    drops both the .pth and the launcher import. Called from the hook itself so
    the next agent-reach invocation repairs the launcher on its own.
    """
    changed = False
    pth = _pth_path()
    if not pth.exists():
        _write_pth(pth)
        changed = True
        if not quiet:
            print(f"[heal] hook restored: {pth}")
    exe = _launcher_path()
    if exe and _launcher_needs_patch(exe):
        backup = exe.with_name(exe.name + ".bak-agent-reach")
        if not backup.exists():
            backup.write_bytes(exe.read_bytes())
        try:
            sys.path.insert(0, str(HERE))
            from tools.rewrite_launcher import rewrite
            rewrite(exe)
            changed = True
            if not quiet:
                print(f"[heal] launcher repatched: {exe}")
        except Exception as exc:  # noqa: BLE001
            if not quiet:
                print(f"[heal] launcher repatch failed: {exc}")
    return changed


def doctor() -> int:
    """Exit 0 when the hook is intact for the agent-reach on PATH, 1 when it is stale."""
    pth = _pth_path()
    exe = _launcher_path()
    pth_ok = pth.exists()
    exe_ok = bool(exe) and not _launcher_needs_patch(exe)
    print(f"pth      : {'ok' if pth_ok else 'MISSING'}  {pth}")
    print(f"launcher : {'ok' if not exe else ('ok' if exe_ok else 'STALE')}  {exe or '<none>'}")
    if pth_ok and exe_ok:
        print("verdict  : healthy")
        return 0
    print("verdict  : stale — run `python install.py` to repair")
    return 1


def status() -> int:
    path = _pth_path()
    print(f"hook file : {path} {'(present)' if path.exists() else '(missing)'}")
    exe = _launcher_path()
    if exe:
        import zipfile
        try:
            with zipfile.ZipFile(exe) as z:
                patched = b"agent_reach_firecrawl" in z.read("__main__.py")
            print(f"launcher  : {exe} {'(patched)' if patched else '(unpatched)'}")
        except Exception as exc:  # noqa: BLE001
            print(f"launcher  : {exe} (unreadable: {exc})")

    # Report the live backend chain from the env agent-reach actually uses.
    py = _uv_python() or Path(sys.executable)
    probe = (
        "import sys, json, agent_reach_firecrawl as m; m.apply();"
        "from agent_reach.channels.web import WebChannel as W;"
        "print(json.dumps({a.name: [b[0] for b in a.backends] for a in W.actions}));"
        "print(m._base_url() or '<not configured>');"
        "print('<set>' if m._api_key() else '<none>')"
    )
    import subprocess
    env = dict(os.environ)
    env["PYTHONPATH"] = str(HERE) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    try:
        out = subprocess.run([str(py), "-c", probe], capture_output=True, text=True,
                             timeout=30, env=env)
    except Exception as exc:  # noqa: BLE001
        print(f"probe     : failed ({exc})")
        return 1
    if out.returncode != 0:
        print(f"probe     : failed\n{out.stderr.strip()[:500]}")
        return 1
    lines = out.stdout.strip().splitlines()
    print(f"chain     : {lines[0] if lines else '?'}")
    print(f"base_url  : {lines[1] if len(lines) > 1 else '?'}")
    print(f"api_key   : {lines[2] if len(lines) > 2 else '?'}")
    base = lines[1] if len(lines) > 1 and lines[1] != "<not configured>" else None
    key = None if (len(lines) < 3 or lines[2] == "<none>") else "set"
    if not base:
        print("state     : installed but dormant — set FC_BASE_URL or FC_API_KEY to activate")
        return 0
    return _probe(base, key)


def _probe(base: str, key: str | None) -> int:
    """Reachability only — does not spend credits (no scrape is issued)."""
    import json
    import urllib.request

    url = f"{base.rstrip('/')}/v2/scrape"
    req = urllib.request.Request(url, method="GET")
    if key:
        req.add_header("Authorization", f"Bearer {key}")
    try:
        urllib.request.urlopen(req, timeout=5)
        print("reachable : yes (unexpected 2xx on GET)")
    except urllib.error.HTTPError as exc:
        # Any 4xx/405 proves the service is up and answering HTTP.
        print(f"reachable : yes (HTTP {exc.code} on probe, expected)")
    except Exception as exc:  # noqa: BLE001
        print(f"reachable : no ({exc})")
        return 1
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--status", action="store_true", help="show chain, config and reachability")
    ap.add_argument("--heal", action="store_true", help="repair the hook if agent-reach was updated")
    ap.add_argument("--doctor", action="store_true", help="exit 1 when the hook is stale (scriptable)")
    ns = ap.parse_args()
    if ns.uninstall:
        uninstall()
    elif ns.status:
        sys.exit(status())
    elif ns.heal:
        changed = heal()
        print("[heal] nothing to do" if not changed else "[heal] repaired")
        sys.exit(status())
    elif ns.doctor:
        sys.exit(doctor())
    else:
        install()
