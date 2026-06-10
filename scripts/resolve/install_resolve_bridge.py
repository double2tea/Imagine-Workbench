#!/usr/bin/env python3
"""Install or remove the Imagine Workbench DaVinci Resolve Workflow Integration plugin."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


DEFAULT_RESOLVE_WORKFLOW_DIR = Path(
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
)
DEFAULT_WORKFLOW_NODE_SOURCE = Path(
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
)
WORKFLOW_PLUGIN_NAME = "com.imagine.workbench.resolve"


def install(target_dir: Path, source_dir: Path, workflow_node_source: Path) -> None:
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


def uninstall(target_dir: Path) -> None:
    plugin_target = target_dir / WORKFLOW_PLUGIN_NAME
    if plugin_target.exists():
        shutil.rmtree(plugin_target)
        print(f"removed {plugin_target}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install Imagine Workbench DaVinci Resolve plugin")
    parser.add_argument("action", choices=["install", "uninstall"])
    parser.add_argument("--workflow-target-dir", default=str(DEFAULT_RESOLVE_WORKFLOW_DIR))
    parser.add_argument("--workflow-node-source", default=str(DEFAULT_WORKFLOW_NODE_SOURCE))
    parser.add_argument("--source-dir", default=str(Path(__file__).resolve().parent))
    return parser


def main() -> None:
    args = build_parser().parse_args()
    target_dir = Path(args.workflow_target_dir).expanduser()
    workflow_node_source = Path(args.workflow_node_source).expanduser()
    source_dir = Path(args.source_dir).expanduser()
    if args.action == "install":
        install(target_dir, source_dir, workflow_node_source)
    else:
        uninstall(target_dir)


if __name__ == "__main__":
    main()
