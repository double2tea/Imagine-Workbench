export interface ImageGenerationPayload {
  imageUrl: string | null;
  operationName: string | null;
}

export async function readImageGenerationPayload(response: Response): Promise<ImageGenerationPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    return {
      imageUrl: await readBlobAsDataUrl(await response.blob()),
      operationName: null,
    };
  }

  const data: unknown = await response.json();
  return {
    imageUrl: getStringField(data, "imageUrl"),
    operationName: getStringField(data, "operationName"),
  };
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("图片响应读取失败"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("图片响应读取失败"));
    reader.readAsDataURL(blob);
  });
}
