import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const importImageBodySchema = z.object({
  url: z.string().url(),
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
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return NextResponse.json({ error: "Only http(s) image URLs can be imported" }, { status: 400 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: `Image fetch failed with HTTP ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "URL does not point to an image" }, { status: 400 });
    }

    return new NextResponse(response.body, {
      headers: {
        "Cache-Control": "public, max-age=86400",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
