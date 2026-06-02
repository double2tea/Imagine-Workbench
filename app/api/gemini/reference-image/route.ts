import { NextRequest, NextResponse } from "next/server";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";

export const runtime = "edge";

interface ReferenceImageBody {
  url?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReferenceImageBody;
    if (typeof body.url !== "string" || body.url.trim().length === 0) {
      return NextResponse.json({ error: "Reference image URL is required" }, { status: 400 });
    }

    const imageUrl = parseReferenceImageUrl(body.url);
    if (!imageUrl) return NextResponse.json({ error: "参考图地址无效" }, { status: 400 });
    const allowError = getAllowedReferenceImageError(imageUrl);
    if (allowError) return NextResponse.json({ error: allowError }, { status: 400 });

    const response = await fetch(imageUrl.href, { headers: { Accept: "image/*" } });
    if (!response.ok) {
      return NextResponse.json({ error: `参考图下载失败：HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("Content-Type") ?? "image/png";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "参考图地址不是图片响应" }, { status: 400 });
    }

    const contentLength = response.headers.get("Content-Length");
    const bytes = contentLength ? Number(contentLength) : null;
    if (bytes !== null && Number.isFinite(bytes) && bytes > REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) {
      return NextResponse.json({ error: "参考图文件过大" }, { status: 413 });
    }

    const imageBlob = await readLimitedImageBlob(response, contentType);
    if (!imageBlob) {
      return NextResponse.json({ error: "参考图文件过大" }, { status: 413 });
    }

    return new Response(imageBlob, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "参考图下载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  if (url.protocol !== "https:") return "参考图地址必须是 HTTPS";
  if (url.hostname !== "storage.googleapis.com") return "参考图来源不受支持";
  if (!url.pathname.startsWith("/agnes-aigc-test/images/")) return "参考图路径不受支持";
  return null;
}
