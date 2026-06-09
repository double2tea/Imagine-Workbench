# Resolve AI LUT Workflow

This workflow keeps Imagine Workbench as the AI image orchestration layer, uses a multimodal model for colorist-style analysis, and keeps deterministic LUT compilation local to the Resolve/Python side.

## Pipeline

```text
source frame
-> optional style reference + prompt/preset
-> /api/gemini/generate-image creates a same-shot styled frame
-> scripts/resolve_lut_creator.py builds source/target scope reports
-> /api/resolve/lut-grade-spec returns a constrained LookRecipe JSON
-> local compiler writes a smooth .cube LUT
-> feasibility + scope validation must pass
-> optional Resolve RefreshLUTList + SetLUT on the current video item
```

The generated image prompt always ends with a LUT-feasibility constraint, so the model is asked to change only color, tone, contrast, saturation, white balance, highlight/shadow color, and overall mood.

The script does not trust the AI target blindly. It rejects targets that look like relighting, face/texture rewriting, local exposure changes, or structure changes instead of a global color grade.

## Safety Gates

The default path is fail-fast:

- `feasibility_report.json` checks source/target structure similarity, median luma shift, shadow-floor shift, highlight-ceiling shift, and multimodal LUT feasibility.
- `scope_report.png` shows source, AI target, and LUT preview with RGB histogram, Y waveform, and Cb/Cr vectorscope.
- `scope_metrics.json` records luma percentiles, RGB mean/stddev, chroma median, Cb/Cr median, and source-skin-region metrics when the source frame has enough detectable skin pixels.
- `validation_report.json` checks the compiled LUT preview before Resolve application, including target-matched skin chroma and skin hue angle.

Skin-aware gates are deliberately fail-fast. If the AI target drains the source skin region below a healthy chroma retention threshold, the script rejects it before compiling a LUT. If the compiled preview misses the target skin vectorscope angle or chroma, the LUT is rejected before Resolve application.

If a target fails validation, the script raises an error and does not apply the LUT to Resolve. Use `--allow-unsafe-target` only for debugging compiler behavior.

## Start Workbench

```bash
pnpm dev
```

The Resolve menu wrapper auto-detects Imagine Workbench on `localhost:3000-3010`. The CLI script defaults to `http://localhost:3000`; override with `IMAGINE_WORKBENCH_URL` or `--workbench-url`. Image generation defaults to `--aspect-ratio source`, which infers the closest supported ratio from the source frame.

Resolve-side calls do not inherit browser-only provider settings. Start the Workbench server with backend credentials available, for example:

```bash
TWELVE_AI_API_KEY="sk_..." PORT=3001 pnpm dev
```

## Prompt-only LUT

```bash
python3 scripts/resolve_lut_creator.py \
  --source /path/to/source.png \
  --prompt "cool premium automotive commercial, clean blue-gray shadows, natural skin" \
  --preset cool-luxury \
  --output-dir outputs/resolve-lut
```

## Prompt + Reference Image

```bash
python3 scripts/resolve_lut_creator.py \
  --source /path/to/source.png \
  --reference /path/to/reference.png \
  --prompt "match the reference's color mood while keeping this shot natural" \
  --preset clean-commercial \
  --output-dir outputs/resolve-lut
```

## Fit From An Existing Styled Target

Use this when you already generated the styled frame in the Workbench UI.

```bash
python3 scripts/resolve_lut_creator.py \
  --source /path/to/source.png \
  --target /path/to/styled.png \
  --prompt "fit LUT from approved styled frame" \
  --llm-grade-spec \
  --output-dir outputs/resolve-lut
```

## Resolve Current Clip Mode

Run from Resolve's Python environment or a shell with Resolve scripting available. Open the Color page, select a clip, then omit `--source`:

```bash
python3 scripts/resolve_lut_creator.py \
  --prompt "warm film print, soft shoulder, natural skin" \
  --preset warm-film \
  --llm-grade-spec \
  --apply-resolve
```

When `--apply-resolve` is used on macOS, the LUT is written under Resolve's master LUT folder:

```text
/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT/ImagineWorkbench/
```

The script then calls `RefreshLUTList()` and applies the LUT to node `1` of the current video item.

## Resolve Menu Entry

The local menu wrapper is linked here:

```text
~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/Imagine Workbench AI LUT.py
```

It points back to:

```text
scripts/resolve_lut_menu.py
```

To test:

1. Start Imagine Workbench with `pnpm dev`.
2. Open Resolve, go to the Color page, and select the clip/frame to grade.
3. Run `Workspace -> Scripts -> Imagine Workbench AI LUT`.
4. Enter a prompt, choose a preset, and wait for the LUT to be generated and applied.

If Resolve was already open when the link was created, restart Resolve so it rescans the Scripts folder.

## Presets

- `clean-commercial`
- `orange-teal`
- `warm-film`
- `cool-luxury`
- `bleach-bypass`
- `soft-pastel`
