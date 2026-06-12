import { resolveLocalStorageRuntimeStatus } from "@/lib/storage/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(resolveLocalStorageRuntimeStatus(process.env));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local storage status failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
