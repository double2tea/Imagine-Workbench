import { ApiError } from "./errors";

export async function readResponseBytesWithLimit(response: Response, maxBytes: number, code = "remote_payload_too_large"): Promise<Uint8Array> {
  assertDeclaredResponseSize(response, maxBytes, code);
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError(502, code, `Provider result exceeds ${maxBytes} bytes`);
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

export function limitedResponseBody(response: Response, maxBytes: number, code = "remote_payload_too_large"): ReadableStream<Uint8Array> | null {
  assertDeclaredResponseSize(response, maxBytes, code);
  if (!response.body) return null;
  let total = 0;
  return response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        controller.error(new ApiError(502, code, `Provider result exceeds ${maxBytes} bytes`));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}

function assertDeclaredResponseSize(response: Response, maxBytes: number, code: string): void {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    throw new ApiError(502, code, `Provider result exceeds ${maxBytes} bytes`);
  }
}
