import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import {
  assertLocalResolveCommandRequest,
  claimNextResolveCommand,
  createResolveCommand,
  finishResolveCommand,
  getResolveCommand,
} from "@/lib/api/resolve-commands";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    assertLocalResolveCommandRequest(req);
    if (req.nextUrl.searchParams.get("claim") === "1") {
      return NextResponse.json({ command: claimNextResolveCommand() });
    }
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      throw badRequest("id is required", "missing_command_id");
    }
    const command = getResolveCommand(id);
    if (!command) {
      throw badRequest("command was not found", "resolve_command_not_found");
    }
    return NextResponse.json({ command });
  } catch (error) {
    const response = apiErrorResponse(error, "Failed to read Resolve command");
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertLocalResolveCommandRequest(req);
    const body: unknown = await req.json();
    if (isCommandCompletion(body)) {
      return NextResponse.json({ command: finishResolveCommand(body) });
    }
    return NextResponse.json({ command: createResolveCommand(body) });
  } catch (error) {
    const response = apiErrorResponse(error, "Failed to write Resolve command");
    return NextResponse.json(response.body, { status: response.status });
  }
}

function isCommandCompletion(value: unknown): boolean {
  return typeof value === "object" && value !== null && "id" in value && "status" in value;
}
