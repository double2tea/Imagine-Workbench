import { t } from "@/lib/i18n-core";
import { isKnownProvider, isProviderKey, type CustomProviderDefinition } from "./registry";

export const CUSTOM_PROVIDERS_STORAGE_KEY = "imagine_custom_providers";

export function normalizeCustomProviderBaseUrl(value: string): string {
  const cleanValue = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(cleanValue);
  } catch {
    throw new Error(t("common.notices.baseUrlFormatInvalid"));
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(t("common.notices.baseUrlProtocolInvalid"));
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function createCustomProviderKey(label: string, existingKeys: readonly string[]): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const normalized = base && /^[a-z0-9]/.test(base) ? base.slice(0, 48) : "custom-provider";
  const used = new Set(existingKeys);
  let candidate = normalized;
  let suffix = 2;
  while (used.has(candidate) || isKnownProvider(candidate) || !isProviderKey(candidate)) {
    candidate = `${normalized}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function isCustomProviderDefinition(value: unknown): value is CustomProviderDefinition {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === "string" &&
    isProviderKey(record.key) &&
    !isKnownProvider(record.key) &&
    typeof record.label === "string" &&
    record.label.trim().length > 0 &&
    typeof record.baseUrl === "string" &&
    isSupportedCustomProviderBaseUrl(record.baseUrl)
  );
}

export function normalizeCustomProviderDefinition(
  value: CustomProviderDefinition,
): CustomProviderDefinition {
  return {
    key: value.key,
    label: value.label.trim(),
    baseUrl: normalizeCustomProviderBaseUrl(value.baseUrl),
  };
}

function isSupportedCustomProviderBaseUrl(value: string): boolean {
  try {
    normalizeCustomProviderBaseUrl(value);
    return true;
  } catch {
    return false;
  }
}
