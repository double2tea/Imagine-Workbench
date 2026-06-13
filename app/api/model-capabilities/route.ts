import { NextResponse } from "next/server";
import modelCapabilityCatalog from "@/lib/providers/catalog/data/model-capabilities.json";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(modelCapabilityCatalog, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
