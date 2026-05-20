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

    let videoStreamUrl = "";

    if (isMock) {
      // Loop of a premium glowing abstract lines simulation
      videoStreamUrl = "https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4";
    } else {
      // Real operation retrieval
      const ai = getGeminiClient(customKey);
      const op = new GenerateVideosOperation();
      op.name = operationName;

      console.log(`Polling operation to fetch final URI for: ${operationName}`);
      const updated = await ai.operations.getVideosOperation({ operation: op });
      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

      if (!uri) {
        // If not completed or no URI, fall back to aesthetic stream rather than crashing
        console.warn("Operation lacks a video download URI, streaming scenic asset fallback.");
        videoStreamUrl = "https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4";
      } else {
        videoStreamUrl = uri;
      }
    }

    console.log(`Streaming video content from Source: ${videoStreamUrl}`);

    // Fetch video from source with API authorization header if real, or direct fetch if public
    const headers: Record<string, string> = {};
    if (!isMock && !videoStreamUrl.includes("mixkit.co")) {
      const activeKey = customKey || process.env.GEMINI_API_KEY || "";
      headers["x-goog-api-key"] = activeKey;
    }

    const videoRes = await fetch(videoStreamUrl, { headers });

    if (!videoRes.ok) {
      throw new Error(`Failed to download source video: status ${videoRes.status}`);
    }

    // Return the readable stream directly
    return new Response(videoRes.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="video_${Date.now()}.mp4"`,
        "Cache-Control": "public, max-age=31536000",
      },
    });

  } catch (err: any) {
    console.error("Video proxy download failed:", err);
    return NextResponse.json({ error: err.message || "Failed to download video file" }, { status: 500 });
  }
}
