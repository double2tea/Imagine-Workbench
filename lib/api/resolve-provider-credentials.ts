import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { badRequest } from "./errors";
import { isProviderKey } from "../providers/registry";

export interface ResolveProviderCredentialEntry {
  apiKey: string;
  baseUrl: string;
  providerLabel?: string;
}

export type ResolveProviderCredentialStore = Record<string, ResolveProviderCredentialEntry>;

export interface ResolveProviderCredentialPathOptions {
  homeDir?: string;
}

const credentialWriteQueues = new Map<string, Promise<void>>();

export function resolveProviderCredentialsPath(options: ResolveProviderCredentialPathOptions = {}): string {
  return join(
    options.homeDir ?? homedir(),
    "Library",
    "Application Support",
    "Imagine Workbench",
    "resolve-provider-credentials.json",
  );
}

export function assertLocalResolveCredentialRequest(req: Request): void {
  const hostname = new URL(req.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    throw badRequest("Resolve provider credentials are local-only", "local_request_required");
  }
}

export async function readResolveProviderCredentials(
  options: ResolveProviderCredentialPathOptions = {},
): Promise<ResolveProviderCredentialStore> {
  return readCredentialStore(resolveProviderCredentialsPath(options));
}

async function readCredentialStore(credentialsPath: string): Promise<ResolveProviderCredentialStore> {
  try {
    const raw = await readFile(credentialsPath, "utf8");
    return parseResolveProviderCredentialsJson(raw);
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }
}

export function parseResolveProviderCredentialsJson(raw: string): ResolveProviderCredentialStore {
  return parseResolveProviderCredentialStore(parseFirstJsonValue(raw));
}

export async function writeResolveProviderCredential(
  provider: string,
  input: unknown,
  options: ResolveProviderCredentialPathOptions = {},
): Promise<ResolveProviderCredentialStore> {
  if (!isProviderKey(provider)) {
    throw badRequest("provider must be a valid provider key", "invalid_provider");
  }
  const nextEntry = parseResolveProviderCredentialEntry(input);
  const credentialsPath = resolveProviderCredentialsPath(options);
  return enqueueCredentialStoreUpdate(credentialsPath, async () => {
    const store = await readCredentialStore(credentialsPath);
    if (!nextEntry.apiKey && !nextEntry.baseUrl) {
      delete store[provider];
    } else {
      store[provider] = nextEntry;
    }
    await writeCredentialStore(credentialsPath, store);
    return store;
  });
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

function parseFirstJsonValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const objectEnd = firstCompleteJsonObjectEnd(raw);
    if (objectEnd === undefined) {
      throw error;
    }
    return JSON.parse(raw.slice(0, objectEnd));
  }
}

function firstCompleteJsonObjectEnd(raw: string): number | undefined {
  const start = raw.search(/\S/);
  if (start === -1 || raw[start] !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return undefined;
}

function readOptionalString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw badRequest("credential fields must be strings", "invalid_credential_field");
  }
  return value.trim();
}

function enqueueCredentialStoreUpdate<T>(credentialsPath: string, update: () => Promise<T>): Promise<T> {
  const previous = credentialWriteQueues.get(credentialsPath) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(update);
  const nextQueue = pending.then(() => undefined, () => undefined);
  credentialWriteQueues.set(credentialsPath, nextQueue);
  void nextQueue.then(() => {
    // A newer queued write owns cleanup if the map entry has already advanced.
    if (credentialWriteQueues.get(credentialsPath) === nextQueue) {
      credentialWriteQueues.delete(credentialsPath);
    }
  });
  return pending;
}

async function writeCredentialStore(credentialsPath: string, store: ResolveProviderCredentialStore): Promise<void> {
  await mkdir(dirname(credentialsPath), { recursive: true });
  const tempPath = `${credentialsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    await rename(tempPath, credentialsPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
