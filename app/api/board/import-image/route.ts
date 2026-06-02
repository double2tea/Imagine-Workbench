import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "edge";

const importImageBodySchema = z.object({
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  try {
    const parsedBody = importImageBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
    }

    const url = new URL(parsedBody.data.url);
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
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
