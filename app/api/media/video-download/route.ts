import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { downloadVideo } from "@/lib/providers/video";
import { optionalText, parseMediaOperationName, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface DownloadBody {
  operationName?: unknown;
  model?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseDownloadOperationName(requireApiText(body.operationName, "operationName"));
    if (operation.mediaType !== "video") {
      throw badRequest("Only video operations can be downloaded", "invalid_media_type");
    }

    const config = resolveProviderConfig(req, operation.provider);
    return await downloadVideo(config, operation.id, optionalText(body.model));
  } catch (err) {
    const response = apiErrorResponse(err, "Failed to download video file");
    if (response.status >= 500) console.error("Video proxy download failed:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function parseDownloadOperationName(operationName: string): ReturnType<typeof parseMediaOperationName> {
  try {
    return parseMediaOperationName(operationName);
  } catch {
    throw badRequest("Unsupported media operation name", "invalid_operation_name");
  }
}
