import { NextRequest, NextResponse } from "next/server";
import { createChatCompletionText, parseJsonObjectText } from "@/lib/providers/chat";
import { DEFAULT_CHAT_MODEL, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";
import type { ChatContentPart } from "@/lib/providers/types";

export const runtime = "nodejs";

interface LutGradeSpecBody {
  prompt?: unknown;
  model?: unknown;
  sourceImage?: unknown;
  targetImage?: unknown;
  scopeReport?: unknown;
  scopeMetrics?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LutGradeSpecBody;
    const modelValue = optionalText(body.model) ?? req.headers.get("x-ai-chat-model") ?? DEFAULT_CHAT_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const prompt = requireText(body.prompt, "Prompt");
    const sourceImage = requireText(body.sourceImage, "Source image");
    const targetImage = requireText(body.targetImage, "Target image");
    const scopeReport = requireText(body.scopeReport, "Scope report");
    const scopeMetrics = body.scopeMetrics;

    const content: ChatContentPart[] = [
      {
        type: "text",
        text:
          "Analyze these images for a DaVinci Resolve LUT. Image 1 is the original source frame. " +
          "Image 2 is the AI styled target frame. Image 3 is a scope report containing the source/target " +
          "thumbnail, RGB histogram, Y waveform, and Cb/Cr vectorscope. " +
          "Return only a JSON object with conservative, LUT-safe grade parameters. " +
          "Do not try to describe structural, relighting, face, texture, depth-of-field, or local changes as LUT parameters.\n\n" +
          `Creative direction: ${prompt}\n\n` +
          `Numeric scope metrics:\n${JSON.stringify(scopeMetrics, null, 2)}\n\n` +
          "Schema and limits:\n" +
          "{\n" +
          '  "lutFeasibility": number 0..1,\n' +
          '  "nonLutChanges": string[],\n' +
          '  "toneStrength": number 0..0.65,\n' +
          '  "shadowLift": number -0.05..0.05,\n' +
          '  "midtoneLift": number -0.06..0.08,\n' +
          '  "highlightLift": number -0.06..0.04,\n' +
          '  "contrast": number 0.88..1.12,\n' +
          '  "chromaStrength": number 0..1,\n' +
          '  "saturation": number 0.25..1.12,\n' +
          '  "temperatureShift": number -0.04..0.04,\n' +
          '  "tintShift": number -0.04..0.04,\n' +
          '  "skinProtection": number 0.6..1,\n' +
          '  "colorSpaceAssumption": string,\n' +
          '  "warnings": string[]\n' +
          "}",
      },
      { type: "image_url", image_url: { url: sourceImage } },
      { type: "image_url", image_url: { url: targetImage } },
      { type: "image_url", image_url: { url: scopeReport } },
    ];

    const text = await createChatCompletionText(
      config,
      parsed.model,
      [
        {
          role: "system",
          content:
            "You are a senior colorist and color-science assistant. You read RGB histograms, luma waveforms, " +
            "vectorscopes, skin-tone behavior, highlight rolloff, shadow floor, and saturation distribution. " +
            "Your output must be conservative, smooth, and feasible as a single global 3D LUT. Preserve black floor, " +
            "white ceiling, healthy skin chroma, skin hue continuity, and midtone separation. Reject the AI target's structural relighting " +
            "and only keep the part a colorist could reproduce with primary tone/chroma controls.",
        },
        { role: "user", content },
      ],
      0.15,
      { responseFormat: { type: "json_object" } },
    );
    const gradeSpec = readGradeSpec(parseJsonObjectText(text));
    return NextResponse.json({ gradeSpec });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze LUT grade spec";
    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("LUT grade spec route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readGradeSpec(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Grade spec response must be a JSON object");
  return {
    lutFeasibility: boundedNumber(value.lutFeasibility, 0, 1, "lutFeasibility"),
    nonLutChanges: readStringList(value.nonLutChanges, 8),
    toneStrength: boundedNumber(value.toneStrength, 0, 0.65, "toneStrength"),
    shadowLift: boundedNumber(value.shadowLift, -0.05, 0.05, "shadowLift"),
    midtoneLift: boundedNumber(value.midtoneLift, -0.06, 0.08, "midtoneLift"),
    highlightLift: boundedNumber(value.highlightLift, -0.06, 0.04, "highlightLift"),
    contrast: boundedNumber(value.contrast, 0.88, 1.12, "contrast"),
    chromaStrength: boundedNumber(value.chromaStrength, 0, 1, "chromaStrength"),
    saturation: boundedNumber(value.saturation, 0.25, 1.12, "saturation"),
    temperatureShift: boundedNumber(value.temperatureShift, -0.04, 0.04, "temperatureShift"),
    tintShift: boundedNumber(value.tintShift, -0.04, 0.04, "tintShift"),
    skinProtection: boundedNumber(value.skinProtection, 0.6, 1, "skinProtection"),
    colorSpaceAssumption: typeof value.colorSpaceAssumption === "string" ? value.colorSpaceAssumption : "Unknown",
    warnings: readStringList(value.warnings, 6),
  };
}

function boundedNumber(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

function readStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
