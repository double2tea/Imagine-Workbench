import { NextRequest, NextResponse } from "next/server";
import { cancelVideo } from "@/lib/providers/video";
import { parseMediaOperationName, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface CancelBody {
  operationName?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CancelBody;
    const operation = parseMediaOperationName(requireText(body.operationName, "operationName"));
    if (operation.provider !== "12ai" || operation.mediaType !== "video") {
      return NextResponse.json({ error: "Only 12AI video tasks can be canceled" }, { status: 400 });
    }

    const config = resolveProviderConfig(req, operation.provider);
    await cancelVideo(config, operation.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to cancel media task";
    console.error("Cancel media task failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
