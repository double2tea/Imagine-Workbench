import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dataUriByteSize, isImageDataUri, REFERENCE_IMAGE_MAX_BYTES } from "@/lib/reference-images";

export const runtime = "edge";

const importImageBodySchema = z.object({
  url: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Image URL is required" }, { status: 400 });
  return importImageUrl(url);
}

export async function POST(req: NextRequest) {
  try {
    const parsedBody = importImageBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }

    return importImageUrl(parsedBody.data.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function importImageUrl(value: string): Promise<Response> {
  try {
    if (!isImageDataUri(value)) {
      return NextResponse.json({ error: "Only data:image/* base64 data URIs can be imported" }, { status: 400 });
    }

    const parsed = parseImageDataUri(value);
    if (parsed.mimeType.toLowerCase() === "image/svg+xml") {
      return NextResponse.json({ error: "SVG data URIs cannot be imported" }, { status: 400 });
    }
    const byteSize = dataUriByteSize(value);
    if (byteSize === null || byteSize > REFERENCE_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "Image data URI is too large" }, { status: 413 });
    }
    let binary: string;
    try {
      binary = atob(parsed.base64);
    } catch {
      return NextResponse.json({ error: "Invalid image data URI" }, { status: 400 });
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": parsed.mimeType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseImageDataUri(value: string): { mimeType: string; base64: string } {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) throw new Error("Only data:image/* base64 data URIs can be imported");
  return { mimeType: match[1], base64: match[2] };
}
