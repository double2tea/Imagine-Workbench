import { NextRequest, NextResponse } from "next/server";
import { downloadRunningHubMedia } from "@/lib/providers/image";
import { parseMediaOperationName, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface DownloadBody {
  operationName?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseMediaOperationName(requireText(body.operationName, "operationName"));
    if (operation.provider !== "runninghub" || operation.mediaType !== "audio") {
      return NextResponse.json({ error: "Only RunningHub audio operations can be downloaded" }, { status: 400 });
    }

    const config = resolveProviderConfig(req, operation.provider);
    return await downloadRunningHubMedia(config, "audio", operation.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download audio file";
    console.error("Audio proxy download failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
