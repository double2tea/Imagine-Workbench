import { NextRequest, NextResponse } from "next/server";
import { downloadVideo } from "@/lib/providers/video";
import { parseMediaOperationName, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface DownloadBody {
  operationName?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseMediaOperationName(requireText(body.operationName, "operationName"));
    if (operation.mediaType !== "video") {
      return NextResponse.json({ error: "Only video operations can be downloaded" }, { status: 400 });
    }

    const config = resolveProviderConfig(req, operation.provider);
    return await downloadVideo(config, operation.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download video file";
    console.error("Video proxy download failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
