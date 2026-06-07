function getStringField(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null || !(field in value)) return null;
  const record = value as Record<string, unknown>;
  const fieldValue = record[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function summarizeTextResponse(text: string): string | null {
  const normalized = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? normalized.slice(0, 180) : null;
}

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function readFetchError(response: Response, fallback: string): Promise<string> {
  const statusText = `${fallback} (HTTP ${response.status})`;
  const text = await response.text();
  if (!text) return statusText;

  try {
    const data: unknown = JSON.parse(text);
    return getStringField(data, "error") ?? getStringField(data, "message") ?? statusText;
  } catch {
    const summary = summarizeTextResponse(text);
    return summary ? `${statusText}: ${summary}` : statusText;
  }
}
