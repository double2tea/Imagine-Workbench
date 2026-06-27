import type { AiProvider } from "@/lib/providers/model-catalog";
import type { ProviderConfig } from "@/lib/providers/types";
import { isCustomProviderDefinition } from "@/lib/providers/custom-providers";
import {
  readProviderRequestApiKey,
  resolveProviderConfig,
  type ResolveProviderConfigOptions,
} from "@/lib/providers/utils";
import { isKnownProvider, type CustomProviderDefinition } from "@/lib/providers/registry";
import { IMAGINE_STORAGE_TARGET_ENV, parseWorkspaceStorageMode } from "@/lib/storage/local-config";
import { resolvePostgresStorageConfig, requireTeamSecretEncryptionKey, type PostgresStorageConfig } from "@/lib/storage/postgres/config";
import { type PostgresQueryable, withPostgresClient } from "@/lib/storage/postgres/connection";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import { decryptWorkspaceSecret, isEncryptedWorkspaceSecret } from "@/lib/storage/team-secret-crypto";
import { readTeamSessionToken, type TeamRole } from "@/lib/storage/team-auth";

export interface ResolveProviderConfigForRequestOptions extends ResolveProviderConfigOptions {
  minimumTeamRole?: TeamRole;
}

interface TeamProviderConfigOverrides {
  apiKey: string | null;
  baseUrl: string | null;
  providerLabel?: string;
}

export async function resolveProviderConfigForRequest(
  req: Request,
  provider: AiProvider,
  options: ResolveProviderConfigForRequestOptions = {},
): Promise<ProviderConfig> {
  if (
    readProviderRequestApiKey(req, options) ||
    parseWorkspaceStorageMode(process.env[IMAGINE_STORAGE_TARGET_ENV]) !== "postgres" ||
    !readTeamSessionToken(req)
  ) {
    return resolveProviderConfig(req, provider, options);
  }

  const config = resolvePostgresStorageConfig(process.env);
  const encryptionKey = requireTeamSecretEncryptionKey(process.env);
  const overrides = await withPostgresClient(config, queryable => readTeamProviderConfigOverrides(
    queryable,
    config,
    req,
    provider,
    encryptionKey,
    options.minimumTeamRole ?? "editor",
  ));
  return resolveProviderConfig(req, provider, {
    ...options,
    apiKeyOverride: overrides.apiKey ?? undefined,
    baseUrlOverride: overrides.baseUrl ?? undefined,
    providerLabelOverride: overrides.providerLabel,
  });
}

export async function readTeamProviderApiKey(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  req: Request,
  provider: AiProvider,
  encryptionKey: string,
  minimumRole: TeamRole,
): Promise<string | null> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, req, { minimumRole });
  const record = await context.repository.settings.get(`provider:${provider}:apiKey`);
  if (!record) return null;
  if (!record.isSecret || !isEncryptedWorkspaceSecret(record.value)) {
    throw new Error(`Team ${provider} API key must be stored as an encrypted secret`);
  }
  return decryptWorkspaceSecret(record.value, encryptionKey);
}

export async function readTeamProviderConfigOverrides(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  req: Request,
  provider: AiProvider,
  encryptionKey: string,
  minimumRole: TeamRole,
): Promise<TeamProviderConfigOverrides> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, req, { minimumRole });
  const [apiKeyRecord, baseUrlRecord, customProvidersRecord] = await Promise.all([
    context.repository.settings.get(`provider:${provider}:apiKey`),
    context.repository.settings.get(`provider:${provider}:baseUrl`),
    isKnownProvider(provider) ? Promise.resolve(null) : context.repository.settings.get("provider:customProviders"),
  ]);

  let apiKey: string | null = null;
  if (apiKeyRecord) {
    if (!apiKeyRecord.isSecret || !isEncryptedWorkspaceSecret(apiKeyRecord.value)) {
      throw new Error(`Team ${provider} API key must be stored as an encrypted secret`);
    }
    apiKey = decryptWorkspaceSecret(apiKeyRecord.value, encryptionKey);
  }

  let customProvider: CustomProviderDefinition | undefined;
  if (customProvidersRecord) {
    if (customProvidersRecord.isSecret) throw new Error("Team custom provider settings must be non-secret");
    customProvider = readCustomProviderDefinition(customProvidersRecord.value, provider);
  }

  let baseUrl: string | null = null;
  if (baseUrlRecord) {
    if (baseUrlRecord.isSecret) throw new Error(`Team ${provider} Base URL must be stored as a non-secret setting`);
    baseUrl = baseUrlRecord.value;
  } else if (customProvider) {
    baseUrl = customProvider.baseUrl;
  }

  return {
    apiKey,
    baseUrl,
    providerLabel: customProvider?.label,
  };
}

function readCustomProviderDefinition(value: string, provider: AiProvider): CustomProviderDefinition | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed.find(item => isCustomProviderDefinition(item) && item.key === provider);
}
