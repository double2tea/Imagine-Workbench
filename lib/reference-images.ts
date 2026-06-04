export const REFERENCE_IMAGE_MAX_EDGE = 2048;
export const REFERENCE_IMAGE_OUTPUT_TYPE = "image/webp";
export const REFERENCE_IMAGE_OUTPUT_QUALITY = 0.85;
export const REFERENCE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const REFERENCE_IMAGES_MAX_TOTAL_BYTES = 15 * 1024 * 1024;
export const REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES = 24 * 1024 * 1024;

export function isImageDataUri(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function isVideoDataUri(value: string): boolean {
  return /^data:video\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function isAudioDataUri(value: string): boolean {
  return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function scaleImageDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new Error("Image dimensions must be positive");
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function dataUriByteSize(dataUri: string): number | null {
  const match = dataUri.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;

  const base64 = match[1];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function getReferenceImagePayloadError(referenceUrls: string[]): string | null {
  let totalBytes = 0;

  for (const url of referenceUrls) {
    const bytes = dataUriByteSize(url);
    if (bytes === null) continue;
    if (bytes > REFERENCE_IMAGE_MAX_BYTES) {
      return `单张参考图压缩后仍超过 ${formatBytes(REFERENCE_IMAGE_MAX_BYTES)}，请换一张更小的图`;
    }
    totalBytes += bytes;
  }

  if (totalBytes > REFERENCE_IMAGES_MAX_TOTAL_BYTES) {
    return `参考图总大小超过 ${formatBytes(REFERENCE_IMAGES_MAX_TOTAL_BYTES)}，请减少参考图或降低图片尺寸`;
  }

  return null;
}

export function getReferenceMediaPayloadError(referenceUrls: string[]): string | null {
  let totalBytes = 0;

  for (const url of referenceUrls) {
    const bytes = dataUriByteSize(url);
    if (bytes === null) continue;
    if (isImageDataUri(url) && bytes > REFERENCE_IMAGE_MAX_BYTES) {
      return `单张参考图压缩后仍超过 ${formatBytes(REFERENCE_IMAGE_MAX_BYTES)}，请换一张更小的图`;
    }
    totalBytes += bytes;
  }

  if (totalBytes > REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) {
    return `参考媒体总大小超过 ${formatBytes(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES)}，请减少参考媒体或压缩后重试`;
  }

  return null;
}

export async function compressReferenceImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("参考图必须是图片文件");
  }

  return compressReferenceImageBlob(file);
}

export async function compressReferenceImageDataUrl(dataUrl: string): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return compressReferenceImageBlob(blob);
}

export async function prepareReferenceImageUrlForRequest(url: string): Promise<string> {
  if (isImageDataUri(url)) return url;
  if (url.startsWith("data:")) throw new Error("参考图必须是 data:image/* base64 图片");

  const response = await fetchReferenceImageUrl(url);
  if (!response.ok) {
    throw new Error(await readReferenceImageFetchError(response));
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("参考图必须是图片文件");
  }
  return compressReferenceImageBlob(blob);
}

export async function prepareReferenceMediaUrlForRequest(url: string): Promise<string> {
  if (isImageDataUri(url)) return url;
  if (isVideoDataUri(url) || isAudioDataUri(url)) return url;
  if (url.startsWith("data:")) throw new Error("参考媒体必须是图片、视频或音频 Data URL");

  const response = await fetchReferenceMediaUrl(url);
  if (!response.ok) {
    throw new Error(await readReferenceImageFetchError(response));
  }

  const blob = await response.blob();
  if (blob.type.startsWith("image/")) return compressReferenceImageBlob(blob);
  if (blob.type.startsWith("video/") || blob.type.startsWith("audio/")) return readBlobAsDataUrl(blob);
  throw new Error("参考媒体必须是图片、视频或音频文件");
}

async function fetchReferenceImageUrl(url: string): Promise<Response> {
  if (url.startsWith("blob:")) return fetch(url);
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return fetch("/api/gemini/reference-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }
  throw new Error("参考图必须是 data:image/*、blob: 或受支持的图片结果地址");
}

async function fetchReferenceMediaUrl(url: string): Promise<Response> {
  if (url.startsWith("blob:")) return fetch(url);
  if (url.startsWith("http://") || url.startsWith("https://")) return fetch(url);
  throw new Error("参考媒体必须是 data:*、blob: 或受支持的媒体结果地址");
}

async function readReferenceImageFetchError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const error = (data as { error?: unknown }).error;
      if (typeof error === "string" && error.trim().length > 0) return error;
    }
  } catch {
  }
  return `参考图读取失败：HTTP ${response.status}`;
}

async function compressReferenceImageBlob(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const dimensions = scaleImageDimensions(bitmap.width, bitmap.height, REFERENCE_IMAGE_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建图片压缩画布");
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

    const compressedBlob = await canvasToBlob(canvas, REFERENCE_IMAGE_OUTPUT_TYPE, REFERENCE_IMAGE_OUTPUT_QUALITY);
    if (compressedBlob.size > REFERENCE_IMAGE_MAX_BYTES) {
      throw new Error(`单张参考图压缩后仍超过 ${formatBytes(REFERENCE_IMAGE_MAX_BYTES)}，请换一张更小的图`);
    }

    return readBlobAsDataUrl(compressedBlob);
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error("图片压缩失败"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("图片压缩结果读取失败"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("图片压缩结果读取失败"));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MB`;
}
