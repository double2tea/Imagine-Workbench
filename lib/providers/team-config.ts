import type { AiProvider } from "@/lib/providers/model-catalog";
import type { ProviderConfig } from "@/lib/providers/types";
import {
  readProviderRequestApiKey,
  resolveProviderConfig,
  type ResolveProviderConfigOptions,
} from "@/lib/providers/utils";
import { IMAGINE_STORAGE_TARGET_ENV, parseWorkspaceStorageMode } from "@/lib/storage/local-config";
import { resolvePostgresStorageConfig, requireTeamSecretEncryptionKey, type PostgresStorageConfig } from "@/lib/storage/postgres/config";
import { type PostgresQueryable, withPostgresClient } from "@/lib/storage/postgres/connection";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import { decryptWorkspaceSecret, isEncryptedWorkspaceSecret } from "@/lib/storage/team-secret-crypto";
import { readTeamSessionToken, type TeamRole } from "@/lib/storage/team-auth";

export interface ResolveProviderConfigForRequestOptions extends ResolveProviderConfigOptions {
  minimumTeamRole?: TeamRole;
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
  const apiKeyOverride = await withPostgresClient(config, queryable => readTeamProviderApiKey(
    queryable,
    config,
    req,
    provider,
    encryptionKey,
    options.minimumTeamRole ?? "editor",
  ));
  return resolveProviderConfig(req, provider, { ...options, apiKeyOverride: apiKeyOverride ?? undefined });
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
