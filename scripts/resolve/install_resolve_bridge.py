#!/usr/bin/env python3
"""Install or remove Imagine Workbench Resolve integration entries."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


DEFAULT_RESOLVE_SCRIPT_DIR = Path(
    "~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility"
).expanduser()
DEFAULT_RESOLVE_WORKFLOW_DIR = Path(
    "~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
).expanduser()
DEFAULT_WORKFLOW_NODE_SOURCE = Path(
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
)
WORKFLOW_PLUGIN_NAME = "com.imagine.workbench.resolve"

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


def install_workflow_plugin(target_dir: Path, source_dir: Path, workflow_node_source: Path) -> None:
    plugin_source = source_dir / "workflow-integration" / WORKFLOW_PLUGIN_NAME
    if not plugin_source.is_dir():
        raise RuntimeError(f"Missing workflow plugin source directory: {plugin_source}")
    if not workflow_node_source.is_file():
        raise RuntimeError(f"Missing WorkflowIntegration.node source file: {workflow_node_source}")
    plugin_target = target_dir / WORKFLOW_PLUGIN_NAME
    if plugin_target.exists():
        shutil.rmtree(plugin_target)
    shutil.copytree(plugin_source, plugin_target)
    shutil.copy2(workflow_node_source, plugin_target / "WorkflowIntegration.node")
    print(f"installed {plugin_target}")


def uninstall_workflow_plugin(target_dir: Path) -> None:
    plugin_target = target_dir / WORKFLOW_PLUGIN_NAME
    if plugin_target.exists():
        shutil.rmtree(plugin_target)
        print(f"removed {plugin_target}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install Imagine Workbench Resolve integrations")
    parser.add_argument("action", choices=["install", "uninstall"])
    parser.add_argument("--kind", choices=["scripts", "workflow", "all"], default="workflow")
    parser.add_argument("--target-dir", default=str(DEFAULT_RESOLVE_SCRIPT_DIR))
    parser.add_argument("--workflow-target-dir", default=str(DEFAULT_RESOLVE_WORKFLOW_DIR))
    parser.add_argument("--workflow-node-source", default=str(DEFAULT_WORKFLOW_NODE_SOURCE))
    parser.add_argument("--source-dir", default=str(Path(__file__).resolve().parent))
    return parser


def main() -> None:
    args = build_parser().parse_args()
    target_dir = Path(args.target_dir).expanduser()
    workflow_target_dir = Path(args.workflow_target_dir).expanduser()
    workflow_node_source = Path(args.workflow_node_source).expanduser()
    source_dir = Path(args.source_dir).expanduser()
    if args.action == "install":
        if args.kind in {"scripts", "all"}:
            install(target_dir, source_dir)
        if args.kind in {"workflow", "all"}:
            install_workflow_plugin(workflow_target_dir, source_dir, workflow_node_source)
    else:
        if args.kind in {"scripts", "all"}:
            uninstall(target_dir)
        if args.kind in {"workflow", "all"}:
            uninstall_workflow_plugin(workflow_target_dir)


if __name__ == "__main__":
    main()
