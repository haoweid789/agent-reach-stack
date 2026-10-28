#!/usr/bin/env python3
"""Rewrite the __main__.py payload of the distlib zipapp launcher in place.

The launcher is `<exe bytes><stored zip with one __main__.py><EOCD>`. Growing the
payload shifts the central directory, so this rebuilds the tail: local header +
data + central directory + EOCD, keeping the original exe prefix untouched.
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

MAIN_PY = """import sys
import agent_reach_firecrawl  # firecrawl web backend hook
from agent_reach.cli import main
if __name__ == '__main__':
    sys.argv[0] = sys.argv[0].removesuffix('.exe')
    sys.exit(main())
""".encode()


def rewrite(exe: Path) -> None:
    raw = exe.read_bytes()
    zs = raw.find(b"PK\x03\x04")
    if zs < 0:
        raise SystemExit("launcher is not a zipapp")
    _, ver, flag, _meth, t, d, _crc, _csz, _usz, nlen, elen = struct.unpack(
        "<IHHHHHIIIHH", raw[zs:zs + 30]
    )
    name = raw[zs + 30:zs + 30 + nlen]
    prefix = raw[:zs]

    data = MAIN_PY
    crc = zlib.crc32(data) & 0xFFFFFFFF

    local = struct.pack("<IHHHHHIIIHH", 0x04034B50, ver, flag, 0, t, d, crc,
                        len(data), len(data), nlen, elen) + name
    central = struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, ver, flag, 0, t, d,
                          crc, len(data), len(data), nlen, elen, 0, 0, 0, 0, 0) + name
    # Offsets inside a zipapp-relative zip: central directory sits right after local.
    cd_off = len(local) + len(data)
    eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, 1, 1, len(central), cd_off, 0)

    exe.write_bytes(prefix + local + data + central + eocd)


if __name__ == "__main__":
    rewrite(Path(sys.argv[1]))
