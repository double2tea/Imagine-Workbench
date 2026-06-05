import { NextRequest, NextResponse } from "next/server";
import { getOpenRouterInputSupport } from "@/lib/openrouter/capabilities";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const model = req.nextUrl.searchParams.get("model")?.trim();
  if (!model) {
    return NextResponse.json({ error: "model query parameter is required" }, { status: 400 });
  }

  const inputSupport = await getOpenRouterInputSupport(model);
  return NextResponse.json({
    model,
    inputSupport,
    supportsAudio: inputSupport?.audio ?? null,
    supportsVideo: inputSupport?.video ?? null,
    supportsVision: inputSupport?.image ?? null,
    source: inputSupport === null ? "unknown" : "openrouter",
  });
}
