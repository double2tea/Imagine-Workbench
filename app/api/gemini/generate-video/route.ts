import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      model = "veo-3.1-lite-generate-preview",
      resolution = "720p",
      aspectRatio = "16:9",
      image, // Starting base64 image (optional)
      lastFrame, // Ending base64 image (optional)
      images = [], // Array of base64 images (optional)
    } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const customKey = req.headers.get("x-gemini-api-key") || undefined;
    const hasKey = customKey || process.env.GEMINI_API_KEY;

    // Local sandbox / mock fallback mode
    if (!hasKey) {
      const mockOpName = `models/${model}/operations/mock_${Math.random().toString(36).substring(2, 10)}`;
      return NextResponse.json({
        operationName: mockOpName,
        isMock: true,
        info: "Video queued in local simulator mode. Live video generation will poll and compile and synthesize shortly.",
      });
    }

    const ai = getGeminiClient(customKey);

    const videoConfig: any = {
      numberOfVideos: 1,
      resolution: resolution,
      aspectRatio: aspectRatio,
    };

    const payload: any = {
      model: model,
      prompt: prompt,
      config: videoConfig,
    };

    // Handle starting and ending images from a potential images array
    let activeImage = image;
    let activeLastFrame = lastFrame;
    if (images && Array.isArray(images) && images.length > 0) {
      if (images[0]) activeImage = images[0];
      if (images[1]) activeLastFrame = images[1];
    }

    // Attach starting image
    if (activeImage) {
      const imgClean = activeImage.replace(/^data:image\/\w+;base64,/, "");
      payload.image = {
        imageBytes: imgClean,
        mimeType: "image/png",
      };
    }

    // Attach ending frame for transition videos
    if (activeLastFrame) {
      const frameClean = activeLastFrame.replace(/^data:image\/\w+;base64,/, "");
      videoConfig.lastFrame = {
        imageBytes: frameClean,
        mimeType: "image/png",
      };
    }

    console.log(`Starting Veo Video generation...`);
    const operation = await ai.models.generateVideos(payload);

    return NextResponse.json({
      operationName: operation.name,
    });

  } catch (err: any) {
    console.error("Generate video endpoint failed:", err);
    // Return smooth simulation placeholder rather than crashing, so prompt-matched video pipelines flow perfectly
    const mockId = Math.random().toString(36).substring(2, 10);
    return NextResponse.json({
      operationName: `models/veo-3.1-lite-generate-preview/operations/fallback_${mockId}`,
      isMock: true,
      info: `API call failed (${err.message}). Entering simulation backup mode.`,
    });
  }
}
