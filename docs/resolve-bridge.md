# DaVinci Resolve Bridge

[English](resolve-bridge.md) | [简体中文](zh-CN/resolve-bridge.md)

Imagine Resolve Bridge lets DaVinci Resolve call Imagine Workbench for image generation/editing, video generation, TTS, and transcription/subtitle preparation.

The Resolve plugin runtime is the Workflow Integration panel:

- `--base-url` may point to local, LAN, or deployed Imagine Workbench instances.
- The plugin panel does not expose model IDs. Each operation uses Workbench capability defaults.
- Provider behavior stays in Workbench, not in Resolve plugin code.
- Resolve handles current frame/source media capture and Media Pool import.

## Files

```text
scripts/resolve/install_resolve_bridge.py   macOS install/uninstall helper
scripts/resolve/workflow-integration/       Workflow Integration plugin runtime
```

## Backend Capability Endpoint

```bash
curl http://localhost:3000/api/resolve/capabilities
```

This returns the operations and routes expected by the bridge. It is descriptive only; model/provider execution still happens through existing Workbench routes.

## Install Into Resolve

Install the Workflow Integration panel into Resolve's macOS Workflow Integration folder:

```bash
python3 scripts/resolve/install_resolve_bridge.py install
```

Remove it:

```bash
python3 scripts/resolve/install_resolve_bridge.py uninstall
```

Default Workflow Integration target:

```text
/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins
```

The installer copies Resolve's official `WorkflowIntegration.node` from the Developer examples folder into the plugin bundle. Override it when testing:

```bash
python3 scripts/resolve/install_resolve_bridge.py install --workflow-node-source /path/to/WorkflowIntegration.node
```

Override the target when testing:

```bash
python3 scripts/resolve/install_resolve_bridge.py install --workflow-target-dir /tmp/ResolveWorkflowPlugins
```

After reinstalling, close and reopen the Imagine Workbench Workflow Integration window in Resolve. If Resolve keeps showing an older UI, fully restart Resolve.

The Workflow panel calls Workbench through a validated Electron main-process network layer so local and deployed Workbench endpoints can be used from Resolve. If the Workbench server does not have provider environment variables such as `TWELVE_AI_API_KEY` or `MIMO_API_KEY`, expand `供应商连接` in the panel and enter the matching provider key there. The panel sends it through the existing `x-ai-api-key` header. Provider keys are session-only in the panel and are not persisted by the plugin.

## Workflow Integration Panel

Open the panel from Resolve:

```text
Workspace -> Workflow Integrations -> Imagine Workbench
```

This panel is the product UI direction inspired by modern plugin panels: dark cards, tabs, a bottom prompt area, and no visible model IDs. It directly calls Imagine Workbench HTTP routes and talks to Resolve through `WorkflowIntegration.node`.

Supported operations:

- Image generation
- Image edit from Resolve reference sources (redraw, erase, outpaint, cutout)
- Video generation from current frame, current clip render, current clip source, or timeline In/Out render
- TTS
- Subtitle/ASR
- Connection check

If `Workflow Integrations` is not available in the Resolve build you are using, check the Blackmagic Design documentation for alternative installation paths.

To use a different job file, set:

```bash
export IMAGINE_RESOLVE_JOB="/path/to/job.json"
```

## Dedicated Workbench Endpoint

Use these options for local, LAN, or deployed Imagine Workbench instances:

```bash
--base-url https://your-workbench.example.com
--api-key your_gateway_key
--provider-api-key upstream_provider_key
--provider-base-url https://provider.example/v1
--provider-label "Provider Name"
```

Or environment variables:

```bash
IMAGINE_WORKBENCH_URL
IMAGINE_WORKBENCH_API_KEY
IMAGINE_PROVIDER_API_KEY
IMAGINE_PROVIDER_BASE_URL
IMAGINE_PROVIDER_LABEL
IMAGINE_RESOLVE_OUTPUT_DIR
IMAGINE_RESOLVE_CACHE_DIR
IMAGINE_RESOLVE_RENDER_TIMEOUT_SECONDS
```

## Verification

Run TypeScript route coverage through the provider test suite:

```bash
pnpm run test:providers
```
