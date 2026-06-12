import { resolvePublicLocalStorageRuntimeStatus } from "@/lib/storage/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(resolvePublicLocalStorageRuntimeStatus(process.env));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local storage status failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
