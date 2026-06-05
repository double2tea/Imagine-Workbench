import { NextRequest, NextResponse } from "next/server";
import { getAudioStatus } from "@/lib/providers/audio";
import { getAsyncImageStatus } from "@/lib/providers/image";
import { getVideoStatus } from "@/lib/providers/video";
import { optionalText, parseMediaOperationName, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface StatusBody {
  operationName?: unknown;
  model?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StatusBody;
    const operation = parseMediaOperationName(requireText(body.operationName, "operationName"));
    const config = resolveProviderConfig(req, operation.provider);
    const result = operation.mediaType === "image"
      ? await getAsyncImageStatus(config, operation.id)
      : operation.mediaType === "audio"
        ? await getAudioStatus(config, operation.id)
        : await getVideoStatus(config, operation.id, optionalText(body.model));

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to poll operation status";
    console.error("Poll media status failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
