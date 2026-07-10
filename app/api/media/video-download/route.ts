import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { fetchPublicHttpUrl } from "@/lib/api/public-http-fetch";
import { downloadVideo } from "@/lib/providers/video";
import { resolveProviderConfigForRequest } from "@/lib/providers/team-config";
import { optionalText, parseMediaOperationName } from "@/lib/providers/utils";

export const runtime = "nodejs";

interface DownloadBody {
  operationName?: unknown;
  model?: unknown;
  outputIndex?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseDownloadOperationName(requireApiText(body.operationName, "operationName"));
    if (operation.mediaType !== "video") {
      throw badRequest("Only video operations can be downloaded", "invalid_media_type");
    }

    const config = await resolveProviderConfigForRequest(req, operation.provider);
    return await downloadVideo(config, operation.id, optionalText(body.model), optionalOutputIndex(body.outputIndex), (url, init) =>
      fetchPublicHttpUrl(url, {
        code: "unsafe_video_result_url",
        headers: init?.headers,
        signal: init?.signal ?? undefined,
      }));
  } catch (err) {
    const response = apiErrorResponse(err, "Failed to download video file");
    if (response.status >= 500) console.error("Video proxy download failed:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function optionalOutputIndex(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw badRequest("outputIndex must be a non-negative integer", "invalid_output_index");
  }
  return value;
}

function parseDownloadOperationName(operationName: string): ReturnType<typeof parseMediaOperationName> {
  try {
    return parseMediaOperationName(operationName);
  } catch {
    throw badRequest("Unsupported media operation name", "invalid_operation_name");
  }
}
