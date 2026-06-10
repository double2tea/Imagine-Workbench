# DaVinci Resolve Bridge

Imagine Resolve Bridge lets DaVinci Resolve call Imagine Workbench for image generation/editing, video generation, TTS, and transcription/subtitle preparation.

The bridge is a dedicated Imagine Workbench plugin:

- `--base-url` may point to local, LAN, or deployed Imagine Workbench instances.
- Model/provider behavior stays in Workbench, not in Resolve Python.
- Resolve handles current frame/source media capture and Media Pool import.

LUT creation is not part of this bridge task.

## Files

```text
scripts/resolve/imagine_resolve_bridge.py   Shared external + in-Resolve bridge
scripts/resolve/ImagineWorkbenchResolve.py  Resolve Workspace -> Scripts entry
scripts/resolve/install_resolve_bridge.py   macOS install/uninstall helper
scripts/resolve/job.example.json            In-Resolve job example
```

## Backend Capability Endpoint

```bash
curl http://localhost:3000/api/resolve/capabilities
```

This returns the operations and routes expected by the bridge. It is descriptive only; model/provider execution still happens through existing Workbench routes.

## Install Into Resolve

Install the script entry into the macOS user Resolve Scripts folder:

```bash
python3 scripts/resolve/install_resolve_bridge.py install
```

Remove it:

```bash
python3 scripts/resolve/install_resolve_bridge.py uninstall
```

Default target:

```text
~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility
```

Override the target when testing:

```bash
python3 scripts/resolve/install_resolve_bridge.py install --target-dir /tmp/ResolveScripts
```

## Smoke Test

Check backend connectivity without Resolve:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  doctor
```

Check backend and running Resolve scripting connectivity:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  --connect-resolve \
  doctor
```

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

Reference captures and rendered reference clips default to:

```text
~/Library/Caches/Imagine Workbench/Resolve Bridge
```

Override with:

```bash
--cache-dir /path/to/cache
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

Use the source media for the current playhead video item as a video reference:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  --import-to-resolve \
  generate-video \
  --model 12ai:veo_3_1-fast \
  --prompt "create a stylized continuation from this clip" \
  --reference current-clip-source
```

Use the current Resolve frame as a video reference:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  generate-video \
  --model 12ai:veo_3_1-fast \
  --prompt "animate this frame with a gentle camera push" \
  --reference current-frame
```

Use the rendered timeline range of the current playhead video item as a video reference:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  generate-video \
  --model 12ai:veo_3_1-fast \
  --prompt "extend this exact edited moment into a product beauty shot" \
  --reference current-clip-render
```

Use the current timeline In/Out range as a video reference:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  generate-video \
  --model 12ai:veo_3_1-fast \
  --prompt "use this selected timeline range as the motion and style reference" \
  --reference timeline-inout-render
```

Transcribe the source media for the current playhead video item when the source file is a supported audio upload:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  transcribe \
  --model mimo:mimo-v2.5-asr \
  --audio current-clip-source \
  --language auto
```

Transcribe the current timeline In/Out range:

```bash
python3 scripts/resolve/imagine_resolve_bridge.py \
  --base-url http://localhost:3000 \
  transcribe \
  --model mimo:mimo-v2.5-asr \
  --audio timeline-inout-render \
  --language auto
```

Resolve scripting cannot reliably read arbitrary selected clips through the public API. The bridge uses the current timeline item at the playhead via `GetCurrentVideoItem()`.

Rendered reference tokens use Resolve's render queue APIs:

- `TimelineItem.GetStart(False)` and `TimelineItem.GetEnd(False)` for `current-clip-render`.
- `Timeline.GetMarkInOut()` for `timeline-inout-render`.
- `Project.SetCurrentRenderFormatAndCodec("mp4", "H.264")`.
- `Project.SetRenderSettings({ MarkIn, MarkOut, TargetDir, CustomName, ExportVideo, ExportAudio })`.
- `Project.AddRenderJob()`, `Project.StartRendering(...)`, and `Project.IsRenderingInProgress()`.

The rendered reference files are cache inputs for model calls. Generated AI outputs remain in the persistent output directory.

## In-Resolve Usage

Run the installer above, or copy these two files into a Resolve Scripts folder:

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

Run the bridge unit tests without DaVinci Resolve:

```bash
python3 scripts/resolve/test_imagine_resolve_bridge.py
```

Run TypeScript route coverage through the provider test suite:

```bash
pnpm run test:providers
```
