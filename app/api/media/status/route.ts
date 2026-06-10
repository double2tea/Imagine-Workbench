import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { getAudioStatus } from "@/lib/providers/audio";
import { getAsyncImageStatus } from "@/lib/providers/image";
import { getVideoStatus } from "@/lib/providers/video";
import { optionalText, parseMediaOperationName, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface StatusBody {
  operationName?: unknown;
  model?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StatusBody;
    const operationName = requireApiText(body.operationName, "operationName");
    const operation = parseMediaOperationNameValue(operationName);
    const config = resolveProviderConfig(req, operation.provider);
    const result = operation.mediaType === "image"
      ? await getAsyncImageStatus(config, operation.id)
      : operation.mediaType === "audio"
        ? await getAudioStatus(config, operation.id)
        : await getVideoStatus(config, operation.id, optionalText(body.model));

    return NextResponse.json(result);
  } catch (err) {
    console.error("Poll media status failed:", err);
    const response = apiErrorResponse(err, "Failed to poll operation status");
    return NextResponse.json(response.body, { status: response.status });
  }
}

function parseMediaOperationNameValue(operationName: string): ReturnType<typeof parseMediaOperationName> {
  try {
    return parseMediaOperationName(operationName);
  } catch {
    throw badRequest("Unsupported media operation name", "invalid_operation_name");
  }
}
