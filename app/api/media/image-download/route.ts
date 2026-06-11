import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { downloadImage } from "@/lib/providers/image";
import { parseMediaOperationName, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface DownloadBody {
  operationName?: unknown;
  outputIndex?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseDownloadOperationName(requireApiText(body.operationName, "operationName"));
    if (operation.mediaType !== "image") {
      throw badRequest("Only image operations can be downloaded", "invalid_media_type");
    }

    const config = resolveProviderConfig(req, operation.provider);
    return await downloadImage(config, operation.id, optionalOutputIndex(body.outputIndex));
  } catch (err) {
    const response = apiErrorResponse(err, "Failed to download image file");
    if (response.status >= 500) console.error("Image proxy download failed:", err);
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
