import JSZip from "jszip";
import { randomUUID } from "node:crypto";
import { badRequest } from "@/lib/api/errors";
import type {
  BoardDocument,
  BoardRunningHubNodeInfoBinding,
  BoardRunningHubOutputType,
  BoardRunningHubTargetType,
} from "@/lib/board/types";
import { readCustomPromptTemplate, type CustomPromptTemplate } from "@/lib/custom-prompt-templates";
import type { LibraryAssetRecord, StorageItemMeta, StorageItemType } from "@/lib/db";
import type { GenerationTask } from "@/lib/generation-tasks";
import { dataUriToBlob, parseDataUri } from "@/lib/providers/utils";
import { isProviderKey } from "@/lib/providers/registry";
import { LocalFilePayloadStore } from "@/lib/storage/local-file-payload-store";
import { requireTeamSecretEncryptionKey, type PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceStorageRepository } from "@/lib/storage/repository";
import type {
  WorkspaceAssetRecord,
  WorkspaceAssetPayloadRef,
  WorkspaceSafetySnapshotRecord,
  WorkspaceSettingGroup,
  WorkspaceSettingRecord,
} from "@/lib/storage/schema";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import {
  decryptWorkspaceSecret,
  encryptWorkspaceSecret,
  isEncryptedWorkspaceSecret,
} from "@/lib/storage/team-secret-crypto";
import { redactTeamBoardDocument } from "@/lib/storage/team-boards";
import type {
  TeamWorkspaceBackupExport,
  TeamWorkspaceBackupRestoreResult,
} from "@/lib/storage/team-workspace-backup-types";
import {
  ASSET_INDEX_FILE,
  BACKUP_APP_NAME,
  BOARD_INDEX_FILE,
  GENERATION_TASK_INDEX_FILE,
  LIBRARY_INDEX_FILE,
  MANIFEST_FILE,
  MAX_BACKUP_FILE_COUNT,
  SETTINGS_FILE,
  SUPPORTED_WORKSPACE_BACKUP_SCHEMA_VERSIONS,
  VOICE_PROFILE_INDEX_FILE,
  WORKSPACE_BACKUP_SCHEMA_VERSION,
  type WorkspaceBackupAssetRecord,
  type WorkspaceBackupManifest,
  type WorkspaceBackupSettings,
  type WorkspaceBackupTeamSetting,
} from "@/lib/workspace-backup-format";
import {
  classifyLocalStorageKey,
  isManagedLocalStorageKey,
  isProviderCredentialKey,
  localStorageMigrationPolicy,
} from "@/lib/workspace-local-storage-inventory";
import type { VoiceProfile } from "@/lib/voice-profiles";

const BACKUP_PAGE_SIZE = 500;

interface BrowserLocalStorageRestorePlan {
  promptTemplates: CustomPromptTemplate[];
  providerTargets: BrowserRunningHubSavedTarget[];
  settings: WorkspaceBackupSettings;
  skippedLocalOnlyCount: number;
}

interface BrowserRunningHubSavedTarget {
  accessPassword?: string;
  bindings: BoardRunningHubNodeInfoBinding[];
  id: string;
  label: string;
  outputType: BoardRunningHubOutputType;
  targetId: string;
  targetType: BoardRunningHubTargetType;
}

export async function exportTeamWorkspaceBackup(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  includeCredentials: boolean,
): Promise<TeamWorkspaceBackupExport> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const zip = new JSZip();
  const assets = await listAll(offset => context.repository.assets.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const boards = await listAll(offset => context.repository.boards.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const libraryRecords = await listAll(offset => context.repository.assetLibrary.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const generationTasks = await listAll(offset => context.repository.generationTasks.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const voiceProfiles = await listAll(offset => context.repository.voiceProfiles.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const settings = await exportTeamBackupSettings(context.repository, includeCredentials);
  const assetRecords: WorkspaceBackupAssetRecord[] = [];
  for (const asset of assets) {
    assetRecords.push(await addTeamAssetToZip(zip, context.repository.payloads.read.bind(context.repository.payloads), asset));
  }
  const exportedAt = new Date().toISOString();
  const manifest: WorkspaceBackupManifest = {
    app: BACKUP_APP_NAME,
    assetsFile: ASSET_INDEX_FILE,
    boardsFile: BOARD_INDEX_FILE,
    counts: {
      assets: assetRecords.length,
      boards: boards.length,
      generationTasks: generationTasks.length,
      libraryAssets: libraryRecords.length,
      settingsKeys: countBackupSettings(settings),
      voiceProfiles: voiceProfiles.length,
    },
    exportedAt,
    generationTasksFile: GENERATION_TASK_INDEX_FILE,
    libraryFile: LIBRARY_INDEX_FILE,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    settingsFile: SETTINGS_FILE,
    voiceProfilesFile: VOICE_PROFILE_INDEX_FILE,
  };
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  zip.file(ASSET_INDEX_FILE, JSON.stringify(assetRecords, null, 2));
  zip.file(LIBRARY_INDEX_FILE, JSON.stringify(libraryRecords.map(record => record.record), null, 2));
  zip.file(BOARD_INDEX_FILE, JSON.stringify(boards.map(record => redactTeamBoardDocument(record.board)), null, 2));
  zip.file(GENERATION_TASK_INDEX_FILE, JSON.stringify(generationTasks.map(record => record.task), null, 2));
  zip.file(VOICE_PROFILE_INDEX_FILE, JSON.stringify(voiceProfiles.map(record => record.profile), null, 2));
  zip.file(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  const body = await zip.generateAsync({ type: "arraybuffer" });
  const fileName = `Imagine_Team_Backup_${compactTimestamp(exportedAt)}.zip`;
  await recordTeamAuditEvent(context.queryable, {
    eventType: "team_backup.export",
    metadata: {
      assetCount: assetRecords.length,
      boardCount: boards.length,
      generationTaskCount: generationTasks.length,
      includeCredentials,
      libraryAssetCount: libraryRecords.length,
      settingsKeyCount: countBackupSettings(settings),
      voiceProfileCount: voiceProfiles.length,
    },
    userId: context.session.userId,
    workspaceId: context.session.workspaceId,
  });
  return {
    assetCount: assetRecords.length,
    boardCount: boards.length,
    body,
    fileName,
    generationTaskCount: generationTasks.length,
    libraryAssetCount: libraryRecords.length,
    settingsKeyCount: countBackupSettings(settings),
    targetKind: "postgres",
    voiceProfileCount: voiceProfiles.length,
    workspaceId: context.session.workspaceId,
  };
}

export async function restoreTeamWorkspaceBackup(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  backupFile: Blob,
  includeCredentials: boolean,
): Promise<TeamWorkspaceBackupRestoreResult> {
  const parsed = await parseTeamWorkspaceBackup(backupFile);
  if (parsed.settings.teamSecrets?.length && !includeCredentials) {
    throw badRequest(
      "PostgreSQL credential restore requires the credentials option",
      "team_restore_credentials_required",
    );
  }
  const encryptionKey = includeCredentials ? requireTeamSecretEncryptionKey(process.env) : undefined;
  const browserLocalStorageRestore = buildBrowserLocalStorageRestorePlan(parsed.settings.localStorage, includeCredentials, encryptionKey);
  const settings = mergeWorkspaceBackupSettings(parsed.settings, browserLocalStorageRestore.settings);
  validateUniqueTeamBackupSettingKeys(settings.teamSettings, settings.teamSecrets);
  const settingsKeyCount = countBackupSettings(settings) +
    browserLocalStorageRestore.promptTemplates.length +
    browserLocalStorageRestore.providerTargets.length;
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const safetySnapshot = await createTeamRestoreSafetySnapshot(queryable, config, request);
  const writtenPayloads: WorkspaceAssetPayloadRef[] = [];
  await context.queryable.query("begin");
  try {
    await clearTeamWorkspace(context.repository);
    for (const asset of parsed.assets) {
      const payload = await restoreTeamAsset(context.repository, asset, writtenPayloads);
      await context.repository.assets.put({ meta: payload ? assetMetaWithPayload(asset.record, payload) : assetRecordToMeta(asset.record), payload });
    }
    for (const board of parsed.boards) {
      await context.repository.boards.put(board);
    }
    for (const record of parsed.libraryAssets) {
      await context.repository.assetLibrary.put({ record });
    }
    for (const task of parsed.generationTasks) {
      await context.repository.generationTasks.put(task);
    }
    for (const profile of parsed.voiceProfiles) {
      await context.repository.voiceProfiles.put({ profile });
    }
    await restoreTeamBackupSettings(context.repository, settings, includeCredentials, encryptionKey);
    await restoreTeamPromptTemplates(context.queryable, context.session.workspaceId, browserLocalStorageRestore.promptTemplates);
    await restoreTeamProviderTargets(
      context.queryable,
      context.session.workspaceId,
      browserLocalStorageRestore.providerTargets,
      encryptionKey,
    );
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_backup.restore",
      metadata: {
        assetCount: parsed.assets.length,
        boardCount: parsed.boards.length,
        generationTaskCount: parsed.generationTasks.length,
        libraryAssetCount: parsed.libraryAssets.length,
        safetySnapshotId: safetySnapshot.id,
        settingsKeyCount,
        skippedLocalOnlySettingCount: browserLocalStorageRestore.skippedLocalOnlyCount,
        voiceProfileCount: parsed.voiceProfiles.length,
      },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    await Promise.allSettled(writtenPayloads.map(ref => context.repository.payloads.delete(ref)));
    throw error;
  }
  return {
    assetCount: parsed.assets.length,
    boardCount: parsed.boards.length,
    fileName: "Team workspace restore",
    generationTaskCount: parsed.generationTasks.length,
    libraryAssetCount: parsed.libraryAssets.length,
    safetySnapshotId: safetySnapshot.id,
    settingsKeyCount,
    targetKind: "postgres",
    voiceProfileCount: parsed.voiceProfiles.length,
    workspaceId: context.session.workspaceId,
  };
}

async function exportTeamBackupSettings(
  repository: WorkspaceStorageRepository,
  includeCredentials: boolean,
): Promise<WorkspaceBackupSettings> {
  const records = await repository.settings.list({ includeSecrets: includeCredentials });
  const encryptionKey = includeCredentials ? requireTeamSecretEncryptionKey(process.env) : undefined;
  const teamSettings: WorkspaceBackupTeamSetting[] = [];
  const teamSecrets: WorkspaceBackupTeamSetting[] = [];
  for (const record of records) {
    if (record.isSecret) {
      if (!includeCredentials) continue;
      if (!encryptionKey || !isEncryptedWorkspaceSecret(record.value)) {
        throw new Error(`Team setting ${record.key} must be stored as an encrypted secret`);
      }
      teamSecrets.push(toBackupTeamSetting(record, decryptWorkspaceSecret(record.value, encryptionKey)));
    } else {
      teamSettings.push(toBackupTeamSetting(record, record.value));
    }
  }
  return {
    localStorage: {},
    teamSecrets: includeCredentials ? teamSecrets : undefined,
    teamSettings,
  };
}

async function restoreTeamBackupSettings(
  repository: WorkspaceStorageRepository,
  settings: WorkspaceBackupSettings,
  includeCredentials: boolean,
  encryptionKey: string | undefined,
): Promise<void> {
  const existing = await repository.settings.list({ includeSecrets: includeCredentials });
  for (const record of existing) {
    if (!record.isSecret || includeCredentials) await repository.settings.delete(record.key);
  }
  for (const setting of settings.teamSettings ?? []) {
    await repository.settings.put({
      group: setting.group,
      isSecret: false,
      key: setting.key,
      updatedAt: new Date().toISOString(),
      value: setting.value,
    });
  }
  for (const secret of settings.teamSecrets ?? []) {
    if (!includeCredentials || !encryptionKey) {
      throw badRequest("PostgreSQL credential restore requires the credentials option", "team_restore_credentials_required");
    }
    await repository.settings.put({
      group: secret.group,
      isSecret: true,
      key: secret.key,
      updatedAt: new Date().toISOString(),
      value: encryptWorkspaceSecret(secret.value, encryptionKey),
    });
  }
}

function buildBrowserLocalStorageRestorePlan(
  localStorage: Record<string, string>,
  includeCredentials: boolean,
  encryptionKey: string | undefined,
): BrowserLocalStorageRestorePlan {
  const teamSettings: WorkspaceBackupTeamSetting[] = [];
  const teamSecrets: WorkspaceBackupTeamSetting[] = [];
  const promptTemplates: CustomPromptTemplate[] = [];
  const providerTargets: BrowserRunningHubSavedTarget[] = [];
  let skippedLocalOnlyCount = 0;
  for (const [key, value] of Object.entries(localStorage)) {
    if (!isManagedLocalStorageKey(key)) {
      throw badRequest(`Unsupported browser setting ${key}`, "invalid_team_backup");
    }
    const policy = localStorageMigrationPolicy(key);
    if (policy === "local-only") {
      skippedLocalOnlyCount += 1;
      continue;
    }
    if (isProviderCredentialKey(key) && !includeCredentials) {
      throw badRequest("PostgreSQL credential restore requires the credentials option", "team_restore_credentials_required");
    }
    if (key === "imagine_custom_prompt_templates") {
      promptTemplates.push(...parseBrowserPromptTemplates(value));
      continue;
    }
    if (key === "imagine_runninghub_saved_targets") {
      providerTargets.push(...parseBrowserRunningHubSavedTargets(value));
      continue;
    }
    const converted = convertBrowserLocalStorageSetting(key, value);
    teamSettings.push(...converted.teamSettings);
    teamSecrets.push(...converted.teamSecrets);
  }
  if (teamSecrets.length && (!includeCredentials || !encryptionKey)) {
    throw badRequest("PostgreSQL credential restore requires the credentials option", "team_restore_credentials_required");
  }
  return {
    promptTemplates,
    providerTargets,
    settings: {
      localStorage: {},
      teamSecrets: teamSecrets.length ? teamSecrets : undefined,
      teamSettings,
    },
    skippedLocalOnlyCount,
  };
}

function mergeWorkspaceBackupSettings(
  base: WorkspaceBackupSettings,
  incoming: WorkspaceBackupSettings,
): WorkspaceBackupSettings {
  return {
    localStorage: {},
    teamSecrets: [...(base.teamSecrets ?? []), ...(incoming.teamSecrets ?? [])],
    teamSettings: [...(base.teamSettings ?? []), ...(incoming.teamSettings ?? [])],
  };
}

function convertBrowserLocalStorageSetting(key: string, value: string): {
  teamSecrets: WorkspaceBackupTeamSetting[];
  teamSettings: WorkspaceBackupTeamSetting[];
} {
  if (key === "imagine_ai_provider") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:selected", value)] };
  if (key === "imagine_chat_model") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:chatModel", value)] };
  if (key === "imagine_custom_providers") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:customProviders", value)] };
  if (key === "imagine_chat_model_options") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:modelOptions:chat", value)] };
  if (key === "imagine_image_model_options") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:modelOptions:image", value)] };
  if (key === "imagine_video_model_options") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:modelOptions:video", value)] };
  if (key === "imagine_audio_model_options") return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:modelOptions:audio", value)] };
  if (key === "imagine_provider_credentials") return convertProviderCredentials(value);
  if (key === "imagine_12ai_api_key" || key === "imagine_custom_api_key") {
    return { teamSecrets: [teamSetting("provider", "provider:12ai:apiKey", value)], teamSettings: [] };
  }
  if (key === "imagine_grok2api_api_key") {
    return { teamSecrets: [teamSetting("provider", "provider:grok2api:apiKey", value)], teamSettings: [] };
  }
  if (key === "imagine_grok2api_base_url" || key === "imagine_custom_api_base_url") {
    return { teamSecrets: [], teamSettings: [teamSetting("provider", "provider:grok2api:baseUrl", value)] };
  }
  return {
    teamSecrets: [],
    teamSettings: [teamSetting(settingGroupFromBrowserKey(key), key, value)],
  };
}

function convertProviderCredentials(value: string): {
  teamSecrets: WorkspaceBackupTeamSetting[];
  teamSettings: WorkspaceBackupTeamSetting[];
} {
  const parsed = parseBrowserLocalStorageJson(value, "Browser provider credentials are invalid");
  if (!isRecord(parsed)) throw badRequest("Browser provider credentials are invalid", "invalid_team_backup");
  const teamSecrets: WorkspaceBackupTeamSetting[] = [];
  const teamSettings: WorkspaceBackupTeamSetting[] = [];
  for (const [provider, credentials] of Object.entries(parsed)) {
    if (!isProviderKey(provider) || !isRecord(credentials)) continue;
    const apiKey = optionalString(credentials.apiKey)?.trim();
    const baseUrl = optionalString(credentials.baseUrl)?.trim();
    if (apiKey) teamSecrets.push(teamSetting("provider", `provider:${provider}:apiKey`, apiKey));
    if (baseUrl) teamSettings.push(teamSetting("provider", `provider:${provider}:baseUrl`, baseUrl));
  }
  return { teamSecrets, teamSettings };
}

function settingGroupFromBrowserKey(key: string): WorkspaceSettingGroup {
  const kind = classifyLocalStorageKey(key);
  if (kind === "agent") return "agent";
  if (kind === "model-cache") return "model-cache";
  if (kind === "provider-settings" || kind === "provider-credentials") return "provider";
  if (kind === "ui-preferences") return "ui";
  return "other";
}

function teamSetting(group: WorkspaceSettingGroup, key: string, value: string): WorkspaceBackupTeamSetting {
  return { group, key, value };
}

async function restoreTeamPromptTemplates(
  queryable: PostgresQueryable,
  workspaceId: string,
  templates: CustomPromptTemplate[],
): Promise<void> {
  if (templates.length === 0) return;
  await queryable.query("delete from prompt_templates where workspace_id = $1", [workspaceId]);
  for (const template of templates) {
    await queryable.query(
      `insert into prompt_templates (id, workspace_id, template, created_at, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update
         set template = excluded.template, updated_at = excluded.updated_at
         where prompt_templates.workspace_id = excluded.workspace_id`,
      [template.id, workspaceId, template, template.createdAt, template.updatedAt],
    );
  }
}

async function restoreTeamProviderTargets(
  queryable: PostgresQueryable,
  workspaceId: string,
  targets: BrowserRunningHubSavedTarget[],
  encryptionKey: string | undefined,
): Promise<void> {
  if (targets.length === 0) return;
  await queryable.query("delete from saved_provider_targets where workspace_id = $1 and provider = $2", [workspaceId, "runninghub"]);
  for (const target of targets) {
    const accessPasswordEncrypted = target.accessPassword?.trim()
      ? encryptWorkspaceSecret(target.accessPassword.trim(), requiredEncryptionKey(encryptionKey))
      : undefined;
    const storedTarget = {
      bindings: target.bindings,
      label: target.label,
      outputType: target.outputType,
      provider: "runninghub",
      targetId: target.targetId,
      targetType: target.targetType,
      ...(accessPasswordEncrypted ? { accessPasswordEncrypted } : {}),
    };
    await queryable.query(
      `insert into saved_provider_targets (id, workspace_id, provider, target, is_secret, updated_at)
       values ($1, $2, $3, $4::jsonb, true, now())
       on conflict (id) do update set
         provider = excluded.provider,
         target = excluded.target,
         is_secret = true,
         updated_at = now()`,
      [`${workspaceId}:runninghub:${target.id}`, workspaceId, "runninghub", JSON.stringify(storedTarget)],
    );
  }
}

function requiredEncryptionKey(encryptionKey: string | undefined): string {
  if (!encryptionKey) throw badRequest("PostgreSQL credential restore requires the credentials option", "team_restore_credentials_required");
  return encryptionKey;
}

function parseBrowserPromptTemplates(value: string): CustomPromptTemplate[] {
  const parsed = parseBrowserLocalStorageJson(value, "Browser prompt templates are invalid");
  if (!Array.isArray(parsed)) throw badRequest("Browser prompt templates are invalid", "invalid_team_backup");
  return parsed.map(item => {
    try {
      return readCustomPromptTemplate(item);
    } catch {
      throw badRequest("Browser prompt templates are invalid", "invalid_team_backup");
    }
  });
}

function parseBrowserRunningHubSavedTargets(value: string): BrowserRunningHubSavedTarget[] {
  const parsed = parseBrowserLocalStorageJson(value, "Browser RunningHub saved targets are invalid");
  if (!Array.isArray(parsed)) throw badRequest("Browser RunningHub saved targets are invalid", "invalid_team_backup");
  return parsed.map(readBrowserRunningHubSavedTarget);
}

function parseBrowserLocalStorageJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw badRequest(message, "invalid_team_backup");
  }
}

function readBrowserRunningHubSavedTarget(value: unknown): BrowserRunningHubSavedTarget {
  if (!isRecord(value)) throw badRequest("Browser RunningHub saved target is invalid", "invalid_team_backup");
  const targetType = readRunningHubTargetType(value.targetType);
  const targetId = normalizeBackupText(value.targetId, "Browser RunningHub target id is invalid");
  return {
    accessPassword: optionalString(value.accessPassword),
    bindings: Array.isArray(value.bindings) ? value.bindings.map(readBrowserRunningHubBinding).filter((binding): binding is BoardRunningHubNodeInfoBinding => binding !== null) : [],
    id: optionalString(value.id) ?? `${targetType}:${targetId}`,
    label: normalizeBackupText(value.label, "Browser RunningHub target label is invalid"),
    outputType: readRunningHubOutputType(value.outputType),
    targetId,
    targetType,
  };
}

function readBrowserRunningHubBinding(value: unknown): BoardRunningHubNodeInfoBinding | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  const nodeId = optionalString(value.nodeId);
  const fieldName = optionalString(value.fieldName);
  if (!id || !nodeId || !fieldName) return null;
  return {
    id,
    nodeId,
    fieldName,
    description: optionalString(value.description),
    descriptionEn: optionalString(value.descriptionEn),
    enabled: optionalBoolean(value.enabled),
    fieldData: optionalString(value.fieldData),
    label: optionalString(value.label),
    required: optionalBoolean(value.required),
    source: readRunningHubBindingSource(value.source),
    value: optionalString(value.value) ?? "",
    valueType: readRunningHubBindingValueType(value.valueType),
    referenceIndex: optionalNumber(value.referenceIndex),
    referenceType: readRunningHubReferenceType(value.referenceType),
    deliveryMode: readRunningHubBindingDelivery(value.deliveryMode),
  };
}

function readRunningHubTargetType(value: unknown): BoardRunningHubTargetType {
  if (value === "workflow") return "workflow";
  if (value === "ai-app") return "ai-app";
  throw badRequest("Browser RunningHub target type is invalid", "invalid_team_backup");
}

function readRunningHubOutputType(value: unknown): BoardRunningHubOutputType {
  if (value === "image" || value === "video" || value === "audio") return value;
  throw badRequest("Browser RunningHub output type is invalid", "invalid_team_backup");
}

function readRunningHubBindingSource(value: unknown): BoardRunningHubNodeInfoBinding["source"] {
  if (value === "prompt" || value === "reference" || value === "randomSeed") return value;
  return "literal";
}

function readRunningHubBindingValueType(value: unknown): BoardRunningHubNodeInfoBinding["valueType"] {
  if (value === "number" || value === "boolean" || value === "image" || value === "video" || value === "audio" || value === "raw") return value;
  return "text";
}

function readRunningHubBindingDelivery(value: unknown): BoardRunningHubNodeInfoBinding["deliveryMode"] {
  if (value === "url" || value === "fileName") return value;
  return "raw";
}

function readRunningHubReferenceType(value: unknown): BoardRunningHubNodeInfoBinding["referenceType"] {
  if (value === "video" || value === "audio") return value;
  if (value === "image") return "image";
  return undefined;
}

function normalizeBackupText(value: unknown, message: string): string {
  const text = optionalString(value)?.trim();
  if (!text) throw badRequest(message, "invalid_team_backup");
  return text;
}

function toBackupTeamSetting(record: WorkspaceSettingRecord, value: string): WorkspaceBackupTeamSetting {
  return {
    group: record.group,
    key: record.key,
    value,
  };
}

function countBackupSettings(settings: WorkspaceBackupSettings): number {
  return Object.keys(settings.localStorage).length +
    (settings.teamSettings?.length ?? 0) +
    (settings.teamSecrets?.length ?? 0);
}

async function listAll<T>(load: (offset: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += BACKUP_PAGE_SIZE) {
    const page = await load(offset);
    all.push(...page);
    if (page.length < BACKUP_PAGE_SIZE) return all;
  }
}

async function createTeamRestoreSafetySnapshot(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<WorkspaceSafetySnapshotRecord> {
  const snapshotExport = await exportTeamWorkspaceBackup(queryable, config, request, false);
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const payload = await new LocalFilePayloadStore(config.mediaDir).write({
    blob: new Blob([snapshotExport.body], { type: "application/zip" }),
    mimeType: "application/zip",
  });
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const snapshot: WorkspaceSafetySnapshotRecord = {
    assetCount: snapshotExport.assetCount,
    boardCount: snapshotExport.boardCount,
    createdAt,
    fileName: snapshotExport.fileName,
    generationTaskCount: snapshotExport.generationTaskCount,
    id,
    libraryAssetCount: snapshotExport.libraryAssetCount,
    origin: new URL(request.url).origin,
    payload,
    reason: "restore-workspace",
    settingsKeyCount: snapshotExport.settingsKeyCount,
    sizeBytes: snapshotExport.body.byteLength,
    voiceProfileCount: snapshotExport.voiceProfileCount,
  };
  await context.repository.safetySnapshots.put(snapshot);
  await recordTeamAuditEvent(context.queryable, {
    eventType: "safety_snapshot.save",
    metadata: {
      assetCount: snapshot.assetCount,
      boardCount: snapshot.boardCount,
      id: snapshot.id,
      reason: snapshot.reason,
      sizeBytes: snapshot.sizeBytes,
    },
    userId: context.session.userId,
    workspaceId: context.session.workspaceId,
  });
  return snapshot;
}

async function clearTeamWorkspace(repository: WorkspaceStorageRepository): Promise<void> {
  const [libraryRecords, generationTasks, voiceProfiles, boards, assets] = await Promise.all([
    listAll(offset => repository.assetLibrary.list({ limit: BACKUP_PAGE_SIZE, offset })),
    listAll(offset => repository.generationTasks.list({ limit: BACKUP_PAGE_SIZE, offset })),
    listAll(offset => repository.voiceProfiles.list({ limit: BACKUP_PAGE_SIZE, offset })),
    listAll(offset => repository.boards.list({ limit: BACKUP_PAGE_SIZE, offset })),
    listAll(offset => repository.assets.list({ limit: BACKUP_PAGE_SIZE, offset })),
  ]);
  for (const record of libraryRecords) await repository.assetLibrary.delete(record.record.id);
  for (const task of generationTasks) await repository.generationTasks.delete(task.task.id);
  for (const profile of voiceProfiles) await repository.voiceProfiles.delete(profile.profile.id);
  for (const board of boards) await repository.boards.delete(board.board.id);
  for (const asset of assets) await repository.assets.delete(asset.meta.id);
}

async function restoreTeamAsset(
  repository: WorkspaceStorageRepository,
  asset: ParsedTeamBackupAsset,
  writtenPayloads: WorkspaceAssetPayloadRef[],
): Promise<WorkspaceAssetPayloadRef | undefined> {
  const meta = assetRecordToMeta(asset.record);
  await repository.assets.put({ meta });
  const payloadInput = await teamBackupAssetPayload(asset);
  if (!payloadInput) return undefined;
  const payload = await repository.payloads.write({
    assetId: meta.id,
    blob: payloadInput.blob,
    mimeType: payloadInput.mimeType,
  });
  writtenPayloads.push(payload);
  return payload;
}

function assetRecordToMeta(record: WorkspaceBackupAssetRecord): StorageItemMeta {
  const { mediaFile: _mediaFile, mediaMimeType: _mediaMimeType, url, ...meta } = record;
  void _mediaFile;
  void _mediaMimeType;
  return {
    ...meta,
    hasBlob: Boolean(record.mediaFile || url?.startsWith("data:") || record.hasBlob),
    url: url?.startsWith("data:") ? undefined : url,
  };
}

function assetMetaWithPayload(record: WorkspaceBackupAssetRecord, payload: WorkspaceAssetPayloadRef): StorageItemMeta {
  return {
    ...assetRecordToMeta(record),
    contentHash: payload.contentHash,
    hasBlob: true,
    url: undefined,
  };
}

async function teamBackupAssetPayload(asset: ParsedTeamBackupAsset): Promise<{ blob: Blob; mimeType: string } | null> {
  if (asset.media) return asset.media;
  const url = asset.record.url;
  if (!url?.startsWith("data:")) {
    if (asset.record.hasBlob) throw badRequest(`Asset ${asset.record.id} is missing media content`, "invalid_team_backup");
    return null;
  }
  const { mimeType } = parseDataUri(url);
  validateAssetMimeType(asset.record.id, asset.record.type, mimeType);
  return { blob: dataUriToBlob(url), mimeType };
}

async function addTeamAssetToZip(
  zip: JSZip,
  readPayload: (ref: WorkspaceAssetPayloadRef) => Promise<Blob>,
  asset: WorkspaceAssetRecord,
): Promise<WorkspaceBackupAssetRecord> {
  const meta = redactAssetMeta(asset.meta);
  if (!asset.payload) {
    if (meta.hasBlob) throw new Error(`Team asset ${meta.id} is missing its payload`);
    return { ...meta, url: meta.url ?? "" };
  }
  if (!asset.payload.mimeType) throw new Error(`Team asset ${meta.id} payload MIME type is missing`);
  const extension = mediaExtension(asset.payload.mimeType, meta.type);
  const mediaFile = `assets/media/${safeFileSegment(meta.id)}.${extension}`;
  const blob = await readPayload(asset.payload);
  zip.file(mediaFile, Buffer.from(await blob.arrayBuffer()).toString("base64"), { base64: true });
  const { url: _url, ...record } = meta;
  void _url;
  return {
    ...record,
    mediaFile,
    mediaMimeType: asset.payload.mimeType,
  };
}

interface ParsedTeamWorkspaceBackup {
  assets: ParsedTeamBackupAsset[];
  boards: BoardDocument[];
  generationTasks: GenerationTask[];
  libraryAssets: LibraryAssetRecord[];
  settings: WorkspaceBackupSettings;
  voiceProfiles: VoiceProfile[];
}

interface ParsedTeamBackupAsset {
  media?: {
    blob: Blob;
    mimeType: string;
  };
  record: WorkspaceBackupAssetRecord;
}

async function parseTeamWorkspaceBackup(file: Blob): Promise<ParsedTeamWorkspaceBackup> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  if (Object.keys(zip.files).length > MAX_BACKUP_FILE_COUNT) {
    throw badRequest("Backup file count exceeds the limit", "invalid_team_backup");
  }
  const manifest = parseTeamBackupManifest(await readRequiredZipText(zip, MANIFEST_FILE));
  const assetRecords = parseTeamAssetRecords(await readRequiredZipText(zip, manifest.assetsFile));
  const libraryAssets = manifest.libraryFile
    ? parseRecordArray<LibraryAssetRecord>(await readRequiredZipText(zip, manifest.libraryFile), "library")
    : [];
  const boards = parseRecordArray<BoardDocument>(await readRequiredZipText(zip, manifest.boardsFile), "boards");
  const generationTasks = manifest.generationTasksFile
    ? parseRecordArray<GenerationTask>(await readRequiredZipText(zip, manifest.generationTasksFile), "generation tasks")
    : [];
  const voiceProfiles = manifest.voiceProfilesFile
    ? parseRecordArray<VoiceProfile>(await readRequiredZipText(zip, manifest.voiceProfilesFile), "voice profiles")
    : [];
  const settings = manifest.settingsFile
    ? parseTeamBackupSettings(await readRequiredZipText(zip, manifest.settingsFile))
    : { localStorage: {} };
  if (manifest.counts.assets !== assetRecords.length) throw badRequest("Backup asset count does not match manifest", "invalid_team_backup");
  if (manifest.counts.boards !== boards.length) throw badRequest("Backup board count does not match manifest", "invalid_team_backup");
  if ((manifest.counts.generationTasks ?? 0) !== generationTasks.length) {
    throw badRequest("Backup generation task count does not match manifest", "invalid_team_backup");
  }
  if ((manifest.counts.libraryAssets ?? 0) !== libraryAssets.length) {
    throw badRequest("Backup library count does not match manifest", "invalid_team_backup");
  }
  if ((manifest.counts.voiceProfiles ?? 0) !== voiceProfiles.length) {
    throw badRequest("Backup voice profile count does not match manifest", "invalid_team_backup");
  }
  if (manifest.counts.settingsKeys !== countBackupSettings(settings)) {
    throw badRequest("Backup settings count does not match manifest", "invalid_team_backup");
  }
  validateImportedReferences({
    assetIds: new Set(assetRecords.map(asset => asset.id)),
    generationTasks,
    libraryAssets,
    voiceProfiles,
  });
  return {
    assets: await Promise.all(assetRecords.map(record => parseTeamBackupAssetMedia(zip, record))),
    boards,
    generationTasks,
    libraryAssets,
    settings,
    voiceProfiles,
  };
}

async function parseTeamBackupAssetMedia(
  zip: JSZip,
  record: WorkspaceBackupAssetRecord,
): Promise<ParsedTeamBackupAsset> {
  if (!record.mediaFile) return { record };
  if (!record.mediaMimeType) throw badRequest(`Asset ${record.id} is missing media MIME`, "invalid_team_backup");
  validateAssetMimeType(record.id, record.type, record.mediaMimeType);
  const mediaFile = zip.file(record.mediaFile);
  if (!mediaFile) throw badRequest(`Asset ${record.id} is missing media file`, "invalid_team_backup");
  const data = await mediaFile.async("uint8array");
  const bytes = new Uint8Array(data);
  return {
    media: {
      blob: new Blob([bytes], { type: record.mediaMimeType }),
      mimeType: record.mediaMimeType,
    },
    record,
  };
}

async function readRequiredZipText(zip: JSZip, filePath: string): Promise<string> {
  const file = zip.file(filePath);
  if (!file) throw badRequest(`Backup is missing ${filePath}`, "invalid_team_backup");
  return file.async("text");
}

function parseTeamBackupManifest(text: string): WorkspaceBackupManifest {
  const value = parseJsonRecord(text, "manifest");
  const app = readString(value, "app");
  const schemaVersion = readNumber(value, "schemaVersion");
  if (app !== BACKUP_APP_NAME) throw badRequest("Backup is not an Imagine Workbench backup", "invalid_team_backup");
  if (!SUPPORTED_WORKSPACE_BACKUP_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw badRequest("Backup schema version is unsupported", "invalid_team_backup");
  }
  const counts = readRecord(value, "counts");
  return {
    app,
    schemaVersion,
    exportedAt: readString(value, "exportedAt"),
    assetsFile: readLiteral(value, "assetsFile", ASSET_INDEX_FILE),
    boardsFile: readLiteral(value, "boardsFile", BOARD_INDEX_FILE),
    generationTasksFile: readOptionalLiteral(value, "generationTasksFile", GENERATION_TASK_INDEX_FILE),
    libraryFile: readOptionalLiteral(value, "libraryFile", LIBRARY_INDEX_FILE),
    settingsFile: readOptionalLiteral(value, "settingsFile", SETTINGS_FILE),
    voiceProfilesFile: readOptionalLiteral(value, "voiceProfilesFile", VOICE_PROFILE_INDEX_FILE),
    counts: {
      assets: readNumber(counts, "assets"),
      boards: readNumber(counts, "boards"),
      generationTasks: readOptionalNumber(counts, "generationTasks"),
      libraryAssets: readOptionalNumber(counts, "libraryAssets"),
      settingsKeys: readNumber(counts, "settingsKeys"),
      voiceProfiles: readOptionalNumber(counts, "voiceProfiles"),
    },
  };
}

function parseTeamAssetRecords(text: string): WorkspaceBackupAssetRecord[] {
  const value = parseJsonArray(text, "assets");
  const seenIds = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw badRequest(`Asset ${index + 1} is invalid`, "invalid_team_backup");
    const id = readString(item, "id");
    if (seenIds.has(id)) throw badRequest(`Duplicate asset id ${id}`, "invalid_team_backup");
    seenIds.add(id);
    return {
      aspectRatio: readString(item, "aspectRatio"),
      boardId: readOptionalString(item, "boardId") ?? "",
      contentHash: readOptionalString(item, "contentHash"),
      createdAt: readString(item, "createdAt"),
      cropDerivative: readOptionalUnknown(item, "cropDerivative") as WorkspaceBackupAssetRecord["cropDerivative"],
      errorMessage: readOptionalString(item, "errorMessage"),
      generationRequest: readOptionalUnknown(item, "generationRequest") as WorkspaceBackupAssetRecord["generationRequest"],
      hasBlob: readOptionalBoolean(item, "hasBlob") ?? Boolean(readOptionalString(item, "mediaFile")),
      id,
      libraryItemId: readOptionalString(item, "libraryItemId"),
      maskOriginalId: readOptionalString(item, "maskOriginalId"),
      mediaFile: readOptionalSafePath(item, "mediaFile"),
      mediaMimeType: readOptionalString(item, "mediaMimeType"),
      model: readString(item, "model"),
      operationName: readOptionalString(item, "operationName"),
      progress: readNumber(item, "progress"),
      prompt: readString(item, "prompt"),
      scope: item.scope === "board" ? "board" : "workspace",
      sourceBoardNodeId: readOptionalString(item, "sourceBoardNodeId"),
      sourceBoardResultStackKey: readOptionalString(item, "sourceBoardResultStackKey"),
      status: readAssetStatus(item, "status"),
      type: readAssetType(item, "type"),
      url: readOptionalString(item, "url"),
    };
  });
}

function parseTeamBackupSettings(text: string): WorkspaceBackupSettings {
  const value = parseJsonRecord(text, "settings");
  const localStorage = readRecord(value, "localStorage");
  const entries: Record<string, string> = {};
  for (const [key, item] of Object.entries(localStorage)) {
    if (typeof item !== "string") throw badRequest(`Setting ${key} is invalid`, "invalid_team_backup");
    entries[key] = item;
  }
  const teamSecrets = parseTeamBackupSettingRecords(value, "teamSecrets");
  const teamSettings = parseTeamBackupSettingRecords(value, "teamSettings");
  validateUniqueTeamBackupSettingKeys(teamSettings, teamSecrets);
  return {
    localStorage: entries,
    teamSecrets,
    teamSettings,
  };
}

function parseTeamBackupSettingRecords(
  record: Record<string, unknown>,
  key: "teamSecrets" | "teamSettings",
): WorkspaceBackupTeamSetting[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest(`${key} must be an array`, "invalid_team_backup");
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw badRequest(`${key} item ${index + 1} is invalid`, "invalid_team_backup");
    const group = readSettingGroup(item, "group");
    const settingKey = readString(item, "key");
    const valueText = readString(item, "value");
    const dedupeKey = `${group}:${settingKey}`;
    if (seen.has(dedupeKey)) throw badRequest(`Duplicate ${key} setting ${settingKey}`, "invalid_team_backup");
    seen.add(dedupeKey);
    return { group, key: settingKey, value: valueText };
  });
}

function validateUniqueTeamBackupSettingKeys(
  teamSettings: WorkspaceBackupTeamSetting[] | undefined,
  teamSecrets: WorkspaceBackupTeamSetting[] | undefined,
): void {
  const seen = new Set<string>();
  for (const setting of [...(teamSettings ?? []), ...(teamSecrets ?? [])]) {
    if (seen.has(setting.key)) throw badRequest(`Duplicate team setting ${setting.key}`, "invalid_team_backup");
    seen.add(setting.key);
  }
}

function parseRecordArray<T>(text: string, label: string): T[] {
  const value = parseJsonArray(text, label);
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) throw badRequest(`${label} item ${index + 1} is invalid`, "invalid_team_backup");
  }
  return value as T[];
}

function validateImportedReferences(input: {
  assetIds: Set<string>;
  generationTasks: GenerationTask[];
  libraryAssets: LibraryAssetRecord[];
  voiceProfiles: VoiceProfile[];
}): void {
  for (const record of input.libraryAssets) {
    if (!input.assetIds.has(record.assetId)) throw badRequest(`Library record ${record.id} references a missing asset`, "invalid_team_backup");
  }
  for (const task of input.generationTasks) {
    for (const assetId of [...task.resultAssetIds, ...(task.activeResultAssetId ? [task.activeResultAssetId] : [])]) {
      if (!input.assetIds.has(assetId)) throw badRequest(`Generation task ${task.id} references a missing asset`, "invalid_team_backup");
    }
  }
  for (const profile of input.voiceProfiles) {
    const refs = [
      ...profile.referenceAudioAssetIds,
      ...(profile.sourceAssetIds ?? []),
      ...(profile.previewAudioAssetId ? [profile.previewAudioAssetId] : []),
    ];
    for (const assetId of refs) {
      if (!input.assetIds.has(assetId)) throw badRequest(`Voice profile ${profile.id} references a missing asset`, "invalid_team_backup");
    }
  }
}

function parseJsonRecord(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw badRequest(`${label} must be an object`, "invalid_team_backup");
  return value;
}

function parseJsonArray(text: string, label: string): unknown[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw badRequest(`${label} must be an array`, "invalid_team_backup");
  return value;
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  if (!isRecord(value)) throw badRequest(`${key} must be an object`, "invalid_team_backup");
  return value;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) throw badRequest(`${key} is required`, "invalid_team_backup");
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalSafePath(record: Record<string, unknown>, key: string): string | undefined {
  const value = readOptionalString(record, key);
  if (!value) return undefined;
  if (value.startsWith("/") || value.split(/[\\/]+/).some(part => part === "" || part === "..")) {
    throw badRequest(`${key} is invalid`, "invalid_team_backup");
  }
  return value;
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw badRequest(`${key} must be a number`, "invalid_team_backup");
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  return record[key] === undefined ? undefined : readNumber(record, key);
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalUnknown(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function readLiteral<T extends string>(record: Record<string, unknown>, key: string, expected: T): T {
  if (record[key] !== expected) throw badRequest(`${key} is invalid`, "invalid_team_backup");
  return expected;
}

function readOptionalLiteral<T extends string>(record: Record<string, unknown>, key: string, expected: T): T | undefined {
  if (record[key] === undefined) return undefined;
  return readLiteral(record, key, expected);
}

function readAssetType(record: Record<string, unknown>, key: string): StorageItemType {
  const value = record[key];
  if (value === "image" || value === "video" || value === "audio" || value === "transcript") return value;
  throw badRequest(`${key} is invalid`, "invalid_team_backup");
}

function readAssetStatus(record: Record<string, unknown>, key: string): StorageItemMeta["status"] {
  const value = record[key];
  if (value === "complete" || value === "processing" || value === "failed") return value;
  throw badRequest(`${key} is invalid`, "invalid_team_backup");
}

function readSettingGroup(record: Record<string, unknown>, key: string): WorkspaceSettingGroup {
  const value = record[key];
  if (value === "agent" || value === "model-cache" || value === "provider" || value === "ui" || value === "other") return value;
  throw badRequest(`${key} is invalid`, "invalid_team_backup");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function redactAssetMeta(meta: StorageItemMeta): StorageItemMeta {
  if (!meta.generationRequest?.runningHubAccessPassword) return meta;
  const { runningHubAccessPassword: _runningHubAccessPassword, ...generationRequest } = meta.generationRequest;
  void _runningHubAccessPassword;
  return { ...meta, generationRequest };
}

function validateAssetMimeType(id: string, type: StorageItemType, mimeType: string): void {
  if (type === "image" && !mimeType.startsWith("image/")) throw badRequest(`Asset ${id} media type is not image`, "invalid_team_backup");
  if (type === "video" && !mimeType.startsWith("video/")) throw badRequest(`Asset ${id} media type is not video`, "invalid_team_backup");
  if (type === "audio" && !mimeType.startsWith("audio/")) throw badRequest(`Asset ${id} media type is not audio`, "invalid_team_backup");
  if (type === "transcript" && mimeType !== "text/plain") throw badRequest(`Asset ${id} media type is not text`, "invalid_team_backup");
}

function mediaExtension(mimeType: string, type: StorageItemType): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "text/plain") return "txt";
  if (type === "image") return "png";
  if (type === "video") return "mp4";
  if (type === "audio") return "mp3";
  return "txt";
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "workspace";
}

function compactTimestamp(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
