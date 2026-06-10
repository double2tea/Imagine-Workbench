import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { cancelVideo } from "@/lib/providers/video";
import { parseMediaOperationName, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface CancelBody {
  operationName?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CancelBody;
    const operation = parseCancelOperationName(requireApiText(body.operationName, "operationName"));
    if (operation.provider !== "12ai" || operation.mediaType !== "video") {
      throw badRequest("Only 12AI video tasks can be canceled", "unsupported_cancel_operation");
    }

    const config = resolveProviderConfig(req, operation.provider);
    await cancelVideo(config, operation.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const response = apiErrorResponse(err, "Failed to cancel media task");
    if (response.status >= 500) console.error("Cancel media task failed:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function parseCancelOperationName(operationName: string): ReturnType<typeof parseMediaOperationName> {
  try {
    return parseMediaOperationName(operationName);
  } catch {
    throw badRequest("Unsupported media operation name", "invalid_operation_name");
  }
}
