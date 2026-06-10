# DaVinci Resolve Bridge

Imagine Resolve Bridge lets DaVinci Resolve call an Imagine Workbench-compatible media backend for image generation/editing, video generation, TTS, and transcription/subtitle preparation.

The bridge is intentionally loose-coupled:

- Workbench is the default backend, not a hard dependency.
- `--base-url` can point to local, LAN, deployed, or compatible gateway endpoints.
- `--routes-file` can remap route paths without editing the script.
- Provider keys/base URLs can be forwarded through headers when the backend supports them.

LUT creation is not part of this bridge task.

## Files

```text
scripts/resolve/imagine_resolve_bridge.py   Shared external + in-Resolve bridge
scripts/resolve/ImagineWorkbenchResolve.py  Resolve Workspace -> Scripts entry
scripts/resolve/job.example.json            In-Resolve job example
scripts/resolve/routes.example.json         Route override example
```

## Backend Capability Endpoint

```bash
curl http://localhost:3000/api/resolve/capabilities
```

This returns the operations and routes expected by the bridge. It is descriptive only; model/provider execution still happens through existing Workbench routes.

## External CLI Usage

Run these from the project root or from any folder with the script path adjusted.

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  generate-image \
  --model 12ai:gemini-3.1-flash-image-preview \
  --prompt "cinematic product shot on a clean tabletop"
```

Generate an edited image from a local still:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  edit-image \
  --image /path/to/frame.png \
  --model xstx:gpt-image-2 \
  --prompt "replace the background with a premium studio set"
```

Generate video and poll until the result downloads:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  generate-video \
  --model 12ai:veo_3_1-fast \
  --prompt "slow dolly-in on the product, soft rim light" \
  --reference /path/to/reference.png
```

Generate TTS:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  tts \
  --model mimo:mimo-v2.5-tts \
  --text "This is a temporary narrator read." \
  --voice Chloe
```

Transcribe audio and create `.txt` plus `.srt` files:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  transcribe \
  --model mimo:mimo-v2.5-asr \
  --audio /path/to/dialog.wav \
  --language auto
```

Outputs default to:

```text
~/Movies/Imagine Resolve Bridge
```

Override with:

```bash
--output-dir /path/to/output
```

## External Resolve API Control

To import results into the running Resolve project from the terminal, enable Resolve scripting and pass `--import-to-resolve`.

Resolve scripting environment variables on macOS usually look like:

```bash
export RESOLVE_SCRIPT_API="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
export RESOLVE_SCRIPT_LIB="/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
export PYTHONPATH="$PYTHONPATH:$RESOLVE_SCRIPT_API/Modules/"
```

Example:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  --import-to-resolve \
  generate-image \
  --model 12ai:gemini-3.1-flash-image-preview \
  --prompt "cinematic insert shot of a jade bracelet"
```

Use the current Resolve frame as the image edit source:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  --import-to-resolve \
  edit-image \
  --image current-frame \
  --model xstx:gpt-image-2 \
  --prompt "remove small dust marks and keep the product unchanged"
```

## In-Resolve Usage

Copy or symlink these two files into a Resolve Scripts folder:

```text
scripts/resolve/ImagineWorkbenchResolve.py
scripts/resolve/imagine_resolve_bridge.py
```

macOS user Scripts folder:

```text
~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility
```

Create a job file:

```text
~/Movies/Imagine Resolve Bridge/job.json
```

Example job:

```json
{
  "operation": "generate-image",
  "baseUrl": "http://localhost:3000",
  "model": "12ai:gemini-3.1-flash-image-preview",
  "prompt": "cinematic product shot on a clean tabletop",
  "outputName": "resolve_generated_image",
  "importToResolve": true
}
```

Then run:

```text
Workspace -> Scripts -> Utility -> ImagineWorkbenchResolve
```

To use a different job file, set:

```bash
export IMAGINE_RESOLVE_JOB="/path/to/job.json"
```

## Endpoint Replacement

Use these options for deployed or compatible backends:

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
```

Route paths can be remapped with:

```bash
--routes-file scripts/resolve/routes.example.json
```

The route JSON may override any key from `BridgeRoutes` in `imagine_resolve_bridge.py`.

## Verification

Run the bridge unit tests without DaVinci Resolve:

```bash
python3 scripts/resolve/test_imagine_resolve_bridge.py
```

Run TypeScript route coverage through the provider test suite:

```bash
pnpm run test:providers
```
