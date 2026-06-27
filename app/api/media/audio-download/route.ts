import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { downloadAudio } from "@/lib/providers/audio";
import { resolveProviderConfigForRequest } from "@/lib/providers/team-config";
import { parseMediaOperationName } from "@/lib/providers/utils";

export const runtime = "nodejs";

interface DownloadBody {
  operationName?: unknown;
  outputIndex?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseDownloadOperationName(requireApiText(body.operationName, "operationName"));
    if (operation.mediaType !== "audio") {
      throw badRequest("Only audio operations can be downloaded", "invalid_media_type");
    }

    const config = await resolveProviderConfigForRequest(req, operation.provider);
    return await downloadAudio(config, operation.id, optionalOutputIndex(body.outputIndex));
  } catch (err) {
    const response = apiErrorResponse(err, "Failed to download audio file");
    if (response.status >= 500) console.error("Audio proxy download failed:", err);
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
