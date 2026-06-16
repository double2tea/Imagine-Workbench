import { t } from "@/lib/i18n";

export interface ImageGenerationPayload {
  imageUrl: string | null;
  imageUrls: string[];
  operationName: string | null;
}

export async function readImageGenerationPayload(response: Response): Promise<ImageGenerationPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    const imageUrl = await readBlobAsDataUrl(await response.blob());
    return {
      imageUrl,
      imageUrls: [imageUrl],
      operationName: null,
    };
  }

  const data: unknown = await response.json();
  const imageUrls = getStringArrayField(data, "imageUrls");
  const imageUrl = imageUrls[0] ?? getStringField(data, "imageUrl");
  return {
    imageUrl,
    imageUrls: imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [],
    operationName: getStringField(data, "operationName"),
  };
}

function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function getStringArrayField(value: unknown, field: string): string[] {
  if (typeof value !== "object" || value === null || !(field in value)) return [];
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  if (!Array.isArray(fieldValue)) return [];
  return fieldValue.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(t("common.errors.fileReadFailed")));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(t("common.errors.fileReadFailed")));
    reader.readAsDataURL(blob);
  });
}
