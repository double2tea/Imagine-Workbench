import { NextRequest, NextResponse } from "next/server";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";
import { readBoundedJsonRequest } from "@/lib/api/request-body";

export const runtime = "edge";

interface ReferenceImageBody {
  url?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBoundedJsonRequest(req, 64 * 1024) as ReferenceImageBody;
    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      return NextResponse.json({ error: "Reference image URL is required" }, { status: 400 });
    }

    const imageUrl = parseReferenceImageUrl(body.url);
    if (!imageUrl) return NextResponse.json({ error: "Reference image URL is invalid" }, { status: 400 });
    const allowError = getAllowedReferenceImageError(imageUrl);
    if (allowError) return NextResponse.json({ error: allowError }, { status: 400 });

    const response = await fetchAllowedReferenceImage(imageUrl);
    if (!response.ok) {
      return NextResponse.json({ error: `Reference image download failed: HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("Content-Type") ?? "image/png";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Reference image URL did not return an image response" }, { status: 400 });
    }

    const contentLength = response.headers.get("Content-Length");
    const bytes = contentLength ? Number(contentLength) : null;
    if (bytes !== null && Number.isFinite(bytes) && bytes > REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) {
      return NextResponse.json({ error: "Reference image file is too large" }, { status: 413 });
    }

    const imageBlob = await readLimitedImageBlob(response, contentType);
    if (!imageBlob) {
      return NextResponse.json({ error: "Reference image file is too large" }, { status: 413 });
    }

    return new Response(imageBlob, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reference image download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchAllowedReferenceImage(initialUrl: URL): Promise<Response> {
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    const allowError = getAllowedReferenceImageError(url);
    if (allowError) throw new Error(allowError);
    const response = await fetch(url.href, { headers: { Accept: "image/*" }, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirectCount === 4) throw new Error("Reference image redirect limit exceeded");
    const location = response.headers.get("Location");
    if (!location) throw new Error("Reference image redirect is missing Location");
    url = new URL(location, url);
  }
  throw new Error("Reference image redirect limit exceeded");
}

function parseReferenceImageUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function readLimitedImageBlob(response: Response, contentType: string): Promise<Blob | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    return blob.size > REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES ? null : blob;
  }

  const chunks: ArrayBuffer[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(result.value.buffer.slice(
      result.value.byteOffset,
      result.value.byteOffset + result.value.byteLength,
    ) as ArrayBuffer);
  }

  return new Blob(chunks, { type: contentType });
}

function getAllowedReferenceImageError(url: URL): string | null {
  if (url.protocol !== "https:") return "Reference image URL must use HTTPS";
  if (url.hostname !== "storage.googleapis.com") return "Reference image source is not supported";
  if (!url.pathname.startsWith("/agnes-aigc-test/images/")) return "Reference image path is not supported";
  return null;
}
