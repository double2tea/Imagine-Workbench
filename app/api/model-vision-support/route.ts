import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterVisionSupport } from "@/lib/openrouter/capabilities";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const model = req.nextUrl.searchParams.get("model")?.trim();
  if (!model) {
    return NextResponse.json({ error: "model query parameter is required" }, { status: 400 });
  }

  const supportsVision = await getOpenRouterVisionSupport(model);
  return NextResponse.json({
    model,
    supportsVision,
    source: supportsVision === null ? "unknown" : "openrouter",
  });
}