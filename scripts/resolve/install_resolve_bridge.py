#!/usr/bin/env python3
"""Install or remove the Imagine Workbench Resolve script entry."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


DEFAULT_RESOLVE_SCRIPT_DIR = Path(
    "~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility"
).expanduser()

BRIDGE_FILES = [
    "ImagineWorkbenchResolve.py",
    "imagine_resolve_bridge.py",
]


def install(target_dir: Path, source_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for name in BRIDGE_FILES:
        source = source_dir / name
        if not source.is_file():
            raise RuntimeError(f"Missing bridge source file: {source}")
        shutil.copy2(source, target_dir / name)
        print(f"installed {target_dir / name}")


def uninstall(target_dir: Path) -> None:
    for name in BRIDGE_FILES:
        target = target_dir / name
        if target.exists():
            target.unlink()
            print(f"removed {target}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install Imagine Workbench Resolve bridge scripts")
    parser.add_argument("action", choices=["install", "uninstall"])
    parser.add_argument("--target-dir", default=str(DEFAULT_RESOLVE_SCRIPT_DIR))
    parser.add_argument("--source-dir", default=str(Path(__file__).resolve().parent))
    return parser


def main() -> None:
    args = build_parser().parse_args()
    target_dir = Path(args.target_dir).expanduser()
    source_dir = Path(args.source_dir).expanduser()
    if args.action == "install":
        install(target_dir, source_dir)
    else:
        uninstall(target_dir)


if __name__ == "__main__":
    main()
