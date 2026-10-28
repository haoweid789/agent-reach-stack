# 安装前先跑这个：python check_env.py
"""安装前环境自检。

检查四项：Python 版本、agent-reach 是否可用、agent-reach 实际安装位置、
以及该位置是否可写（安装补丁需要写 .pth 与启动器）。

    python check_env.py
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

OK = "[ok]  "
WARN = "[warn]"
FAIL = "[fail]"


def _agent_reach_cmd() -> str | None:
    return shutil.which("agent-reach") or shutil.which("agent-reach.exe")


def _uv_tool_root() -> Path | None:
    candidates = []
    roaming = os.environ.get("APPDATA")
    if roaming:
        candidates.append(Path(roaming) / "uv" / "tools" / "agent-reach")
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidates.append(Path(local) / "uv" / "tools" / "agent-reach")
    candidates.append(Path.home() / ".local" / "share" / "uv" / "tools" / "agent-reach")
    for c in candidates:
        if (c / "Lib" / "site-packages" / "agent_reach").is_dir():
            return c
        if (c / "lib").is_dir() and list((c / "lib").glob("python*/site-packages/agent_reach")):
            return c
    return None


def _writable(path: Path) -> bool:
    probe = path / ".write_probe_tmp"
    try:
        probe.write_text("x", encoding="utf-8")
        probe.unlink()
        return True
    except OSError:
        return False


def main() -> int:
    problems: list[str] = []
    print("环境自检\n" + "=" * 46)

    # 1. Python
    ver = sys.version_info
    if ver >= (3, 9):
        print(f"{OK} Python {ver.major}.{ver.minor}.{ver.micro}")
    else:
        print(f"{FAIL} Python {ver.major}.{ver.minor} — 需要 3.9 或更高")
        problems.append("升级 Python 到 3.9+")

    # 2. agent-reach 命令
    cmd = _agent_reach_cmd()
    if cmd:
        print(f"{OK} agent-reach 命令: {cmd}")
        try:
            out = subprocess.run([cmd, "channels"], capture_output=True, text=True, timeout=60)
            if out.returncode == 0 and '"channels"' in out.stdout:
                print(f"{OK} agent-reach 可正常执行 channels")
            else:
                print(f"{WARN} agent-reach channels 返回异常（退出码 {out.returncode}）")
                problems.append("检查 agent-reach 安装是否完整")
        except Exception as exc:  # noqa: BLE001
            print(f"{WARN} 调用 agent-reach 失败: {exc}")
            problems.append("确认 agent-reach 能在当前 shell 中直接运行")
    else:
        print(f"{FAIL} 找不到 agent-reach 命令")
        problems.append("先安装 agent-reach：见 https://github.com/Panniantong/Agent-Reach")

    # 3. 实际安装位置
    target = None
    uv_root = _uv_tool_root()
    if uv_root:
        target = uv_root / "Lib" / "site-packages"
        if not target.is_dir():
            for p in (uv_root / "lib").glob("python*/site-packages"):
                if (p / "agent_reach").is_dir():
                    target = p
                    break
        print(f"{OK} uv tool 环境: {uv_root}")
    else:
        spec = importlib.util.find_spec("agent_reach")
        if spec and spec.submodule_search_locations:
            target = Path(spec.submodule_search_locations[0]).parent
            print(f"{WARN} 未发现 uv tool 环境，按当前 Python 定位: {target}")
        else:
            print(f"{FAIL} 当前 Python 无法 import agent_reach")
            problems.append("用 agent-reach 实际使用的那个 Python 来运行 install.py")

    # 4. 目标可写
    if target and target.is_dir():
        if _writable(target):
            print(f"{OK} 目标目录可写: {target}")
        else:
            print(f"{FAIL} 目标目录不可写: {target}")
            problems.append("用管理员权限运行，或检查该目录的写权限")
    elif target:
        print(f"{FAIL} 目标目录不存在: {target}")
        problems.append("确认 agent-reach 安装目录存在")

    print("=" * 46)
    if problems:
        print("发现 {} 个问题:".format(len(problems)))
        for i, p in enumerate(problems, 1):
            print(f"  {i}. {p}")
        return 1
    print("环境就绪，可以运行: python install.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
