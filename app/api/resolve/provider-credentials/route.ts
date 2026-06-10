import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import {
  assertLocalResolveCredentialRequest,
  readResolveProviderCredentials,
  resolveProviderCredentialsPath,
  writeResolveProviderCredential,
} from "@/lib/api/resolve-provider-credentials";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    assertLocalResolveCredentialRequest(req);
    return NextResponse.json({
      credentials: await readResolveProviderCredentials(),
      path: resolveProviderCredentialsPath(),
    });
  } catch (error) {
    const response = apiErrorResponse(error, "Failed to read Resolve provider credentials");
    return NextResponse.json(response.body, { status: response.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertLocalResolveCredentialRequest(req);
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null) {
      throw badRequest("request body must be an object", "invalid_body");
    }
    const record = body as Record<string, unknown>;
    const provider = record.provider;
    if (typeof provider !== "string") {
      throw badRequest("provider is required", "missing_provider");
    }
    const credentials = await writeResolveProviderCredential(provider, {
      apiKey: record.apiKey,
      baseUrl: record.baseUrl,
      providerLabel: record.providerLabel,
    });
    return NextResponse.json({ credentials, path: resolveProviderCredentialsPath() });
  } catch (error) {
    const response = apiErrorResponse(error, "Failed to write Resolve provider credentials");
    return NextResponse.json(response.body, { status: response.status });
  }
}
