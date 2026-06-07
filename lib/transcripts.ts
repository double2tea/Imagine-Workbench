export const TRANSCRIPT_MIME_TYPE = "text/plain;charset=utf-8";

const TEXT_DATA_URL_PREFIX = `data:${TRANSCRIPT_MIME_TYPE};base64,`;

export function transcriptToDataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${TEXT_DATA_URL_PREFIX}${btoa(binary)}`;
}

export function transcriptFromDataUrl(url: string): string {
  const marker = ";base64,";
  const markerIndex = url.indexOf(marker);
  if (!url.startsWith("data:text/plain") || markerIndex < 0) return "";
  const payload = url.slice(markerIndex + marker.length);
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function transcriptPreview(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}...`;
}
