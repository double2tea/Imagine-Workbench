import { NextRequest, NextResponse } from "next/server";
import { fetchRunningHubAiAppSchema } from "@/lib/providers/runninghub-app";
import { resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface RunningHubAiAppSchemaBody {
  webappId?: unknown;
}

class RunningHubSchemaRequestError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RunningHubAiAppSchemaBody;
    const webappId = requireWebappId(body.webappId);
    const config = resolveProviderConfig(req, "runninghub");
    const schema = await fetchRunningHubAiAppSchema(config, webappId);
    return NextResponse.json(schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RunningHub AI App schema request failed";
    if (error instanceof RunningHubSchemaRequestError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("RunningHub AI App schema route error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function requireWebappId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RunningHubSchemaRequestError("webappId is required");
  }
  const webappId = value.trim();
  if (!/^\d{12,}$/.test(webappId)) {
    throw new RunningHubSchemaRequestError("webappId must be a RunningHub AI App numeric id");
  }
  return webappId;
}
