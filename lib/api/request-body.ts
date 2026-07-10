import { ApiError } from "./errors";

export async function readBoundedJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  assertRequestContentLength(request.headers, maxBytes);
  const bytes = await readRequestBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function assertRequestContentLength(headers: Headers, maxBytes: number): void {
  const value = headers.get("content-length");
  if (value === null) return;
  if (!/^\d+$/.test(value)) {
    throw new ApiError(400, "invalid_content_length", "Content-Length must be a non-negative integer");
  }
  if (Number(value) > maxBytes) throw payloadTooLarge(maxBytes);
}

async function readRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw payloadTooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function payloadTooLarge(maxBytes: number): ApiError {
  return new ApiError(413, "payload_too_large", `Request body exceeds ${maxBytes} bytes`);
}
