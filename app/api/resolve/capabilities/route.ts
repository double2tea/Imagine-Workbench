import { NextResponse } from "next/server";
import { getResolveBridgeCapabilities } from "../../../../lib/api/resolve-capabilities";

export const runtime = "edge";

export function GET() {
  return NextResponse.json(getResolveBridgeCapabilities());
}
