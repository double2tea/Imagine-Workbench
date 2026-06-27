import {
  DATABASE_URL_ENV,
  IMAGINE_MAX_MEDIA_PAYLOAD_BYTES_ENV,
  IMAGINE_MEDIA_DIR_ENV,
  IMAGINE_STORAGE_TARGET_ENV,
  isHostedDeploymentEnvironment,
  parseWorkspaceStorageMode,
  type LocalStorageEnvironment,
} from "@/lib/storage/local-config";

export const IMAGINE_TEAM_SETUP_TOKEN_ENV = "IMAGINE_TEAM_SETUP_TOKEN";
export const IMAGINE_TEAM_SECRET_ENCRYPTION_KEY_ENV = "IMAGINE_TEAM_SECRET_ENCRYPTION_KEY";

export class PostgresStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresStorageConfigError";
  }
}

export interface PostgresStorageConfig {
  databaseUrl: string;
  maxMediaPayloadBytes?: number;
  mediaDir: string;
}

export function resolvePostgresStorageConfig(env: LocalStorageEnvironment): PostgresStorageConfig {
  const mode = parseWorkspaceStorageMode(env[IMAGINE_STORAGE_TARGET_ENV]);
  if (mode !== "postgres") {
    throw new PostgresStorageConfigError(`${IMAGINE_STORAGE_TARGET_ENV}=postgres is required for team storage`);
  }
  if (isHostedDeploymentEnvironment(env)) {
    throw new PostgresStorageConfigError("PostgreSQL storage requires a Node server deployment; hosted edge/static deployments are not supported");
  }

  const databaseUrl = env[DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) throw new PostgresStorageConfigError(`${DATABASE_URL_ENV} is required when ${IMAGINE_STORAGE_TARGET_ENV}=postgres`);

  const mediaDir = env[IMAGINE_MEDIA_DIR_ENV]?.trim();
  if (!mediaDir) throw new PostgresStorageConfigError(`${IMAGINE_MEDIA_DIR_ENV} is required when ${IMAGINE_STORAGE_TARGET_ENV}=postgres`);

  return {
    databaseUrl,
    maxMediaPayloadBytes: parseMaxMediaPayloadBytes(env[IMAGINE_MAX_MEDIA_PAYLOAD_BYTES_ENV]),
    mediaDir,
  };
}

function parseMaxMediaPayloadBytes(value: string | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new PostgresStorageConfigError(`${IMAGINE_MAX_MEDIA_PAYLOAD_BYTES_ENV} is required when ${IMAGINE_STORAGE_TARGET_ENV}=postgres`);
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new PostgresStorageConfigError(`${IMAGINE_MAX_MEDIA_PAYLOAD_BYTES_ENV} must be a positive integer byte count`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new PostgresStorageConfigError(`${IMAGINE_MAX_MEDIA_PAYLOAD_BYTES_ENV} must be a positive integer byte count`);
  }
  return parsed;
}

export function requireTeamSetupToken(env: LocalStorageEnvironment, requestToken: string | null): void {
  const setupToken = env[IMAGINE_TEAM_SETUP_TOKEN_ENV]?.trim();
  if (!setupToken) throw new PostgresStorageConfigError(`${IMAGINE_TEAM_SETUP_TOKEN_ENV} is required for team storage migrations`);
  if (requestToken !== setupToken) throw new PostgresStorageConfigError("Invalid team setup token");
}

export function requireTeamSecretEncryptionKey(env: LocalStorageEnvironment): string {
  const key = env[IMAGINE_TEAM_SECRET_ENCRYPTION_KEY_ENV]?.trim();
  if (!key) throw new PostgresStorageConfigError(`${IMAGINE_TEAM_SECRET_ENCRYPTION_KEY_ENV} is required for team workspace secrets`);
  return key;
}
