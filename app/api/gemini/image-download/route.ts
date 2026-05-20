import { NextRequest, NextResponse } from "next/server";
import { downloadImage } from "@/lib/providers/image";
import { parseMediaOperationName, requireText, resolveProviderConfig } from "@/lib/providers/utils";

interface DownloadBody {
  operationName?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DownloadBody;
    const operation = parseMediaOperationName(requireText(body.operationName, "operationName"));
    if (operation.mediaType !== "image") {
      return NextResponse.json({ error: "Only image operations can be downloaded" }, { status: 400 });
    }

    const config = resolveProviderConfig(req, operation.provider);
    return await downloadImage(config, operation.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download image file";
    console.error("Image proxy download failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
