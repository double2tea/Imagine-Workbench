import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { badRequest } from "@/lib/api/errors";
import { isProviderKey } from "@/lib/providers/registry";

export interface ResolveProviderCredentialEntry {
  apiKey: string;
  baseUrl: string;
  providerLabel?: string;
}

export type ResolveProviderCredentialStore = Record<string, ResolveProviderCredentialEntry>;

const CREDENTIALS_PATH = join(
  homedir(),
  "Library",
  "Application Support",
  "Imagine Workbench",
  "resolve-provider-credentials.json",
);

export function resolveProviderCredentialsPath(): string {
  return CREDENTIALS_PATH;
}

export function assertLocalResolveCredentialRequest(req: Request): void {
  const hostname = new URL(req.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw badRequest("Resolve provider credentials are local-only", "local_request_required");
  }
}

export async function readResolveProviderCredentials(): Promise<ResolveProviderCredentialStore> {
  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf8");
    return parseResolveProviderCredentialStore(JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }
}

export async function writeResolveProviderCredential(provider: string, input: unknown): Promise<ResolveProviderCredentialStore> {
  if (!isProviderKey(provider)) {
    throw badRequest("provider must be a valid provider key", "invalid_provider");
  }
  const store = await readResolveProviderCredentials();
  const nextEntry = parseResolveProviderCredentialEntry(input);
  if (!nextEntry.apiKey && !nextEntry.baseUrl) {
    delete store[provider];
  } else {
    store[provider] = nextEntry;
  }
  await writeCredentialStore(store);
  return store;
}

function parseResolveProviderCredentialStore(value: unknown): ResolveProviderCredentialStore {
  if (typeof value !== "object" || value === null) {
    throw badRequest("stored Resolve provider credentials must be an object", "invalid_credentials_store");
  }
  const result: ResolveProviderCredentialStore = {};
  for (const [provider, entry] of Object.entries(value)) {
    if (isProviderKey(provider)) {
      result[provider] = parseResolveProviderCredentialEntry(entry);
    }
  }
  return result;
}

function parseResolveProviderCredentialEntry(value: unknown): ResolveProviderCredentialEntry {
  if (typeof value !== "object" || value === null) {
    throw badRequest("credential entry must be an object", "invalid_credential_entry");
  }
  const record = value as Record<string, unknown>;
  const apiKey = readOptionalString(record.apiKey);
  const baseUrl = readOptionalString(record.baseUrl);
  const providerLabel = readOptionalString(record.providerLabel);
  return providerLabel ? { apiKey, baseUrl, providerLabel } : { apiKey, baseUrl };
}

function readOptionalString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw badRequest("credential fields must be strings", "invalid_credential_field");
  }
  return value.trim();
}

async function writeCredentialStore(store: ResolveProviderCredentialStore): Promise<void> {
  await mkdir(dirname(CREDENTIALS_PATH), { recursive: true });
  const tempPath = `${CREDENTIALS_PATH}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, CREDENTIALS_PATH);
  await chmod(CREDENTIALS_PATH, 0o600);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
