import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";
import { GenerateVideosOperation } from "@google/genai";

export async function POST(req: NextRequest) {
  try {
    const { operationName } = await req.json();
    if (!operationName) {
      return NextResponse.json({ error: "operationName is required" }, { status: 400 });
    }

    const customKey = req.headers.get("x-gemini-api-key") || undefined;
    const isMock = operationName.includes("/mock_") || operationName.includes("/fallback_");

    if (isMock) {
      // Simulate polling progress based on timestamp embedded in the name
      // Name format: models/{model}/operations/(mock|fallback)_<timestamp>_<rand> or (mock|fallback)_<rand>
      const match = operationName.match(/(?:mock|fallback)_(\d+)/);
      let startedAt = Date.now() - 15000; // default to 15s ago if no timestamp
      if (match && match[1]) {
        startedAt = parseInt(match[1], 10);
      } else {
        // Try parsing any digits
        const digits = operationName.replace(/\D/g, "");
        if (digits.length >= 10) {
          startedAt = parseInt(digits.substring(0, 13), 10);
        }
      }

      const elapsed = Date.now() - startedAt;
      const targetDuration = 12000; // 12 seconds compilation simulation

      if (elapsed >= targetDuration) {
        return NextResponse.json({
          done: true,
          progress: 100,
          status: "complete",
        });
      }

      const progressPercent = Math.min(Math.floor((elapsed / targetDuration) * 100), 99);
      let phase = "Initializing and compiling workspace...";
      if (progressPercent > 30 && progressPercent <= 65) {
        phase = "Synthesizing optical flow and multi-frame matrices...";
      } else if (progressPercent > 65) {
        phase = "Optimizing 24fps motion interpolation layers...";
      }

      return NextResponse.json({
        done: false,
        progress: progressPercent,
        status: phase,
      });
    }

    // Real operation polling
    const ai = getGeminiClient(customKey);
    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });

    return NextResponse.json({
      done: !!updated.done,
      progress: updated.done ? 100 : 50, // Real API doesn't specify precision progress, so 50% until done
      status: updated.done ? "complete" : "Synthesizing videos...",
    });

  } catch (err: any) {
    console.error("Poll video status failed:", err);
    return NextResponse.json({
      done: true,
      error: err.message || "Failed to poll operation status",
      progress: 100,
      status: "failed",
    });
  }
}
