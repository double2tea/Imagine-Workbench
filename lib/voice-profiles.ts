import type { StorageItem } from "./db";
import { t as globalT, type TFunction } from "./i18n-core";
import type { AiProvider } from "./providers/model-catalog";
import { getAudioModelCapabilities, tryParseProviderModel, type AudioOperationMode } from "./providers/model-catalog";
import { MIMO_BUILT_IN_VOICES } from "./providers/mimo-voices";
import {
  deleteTeamVoiceProfile,
  fetchTeamVoiceProfiles,
  fetchWorkspaceStorageRuntimeStatus,
  readTeamCsrfToken,
  saveTeamVoiceProfile,
} from "./storage/team-client";

const VOICE_DB_NAME = "ImagineWorkbenchVoiceDB";
const VOICE_DB_VERSION = 1;
const VOICE_PROFILE_STORE = "voice_profiles";
export const VOICE_PROFILES_CHANGED_EVENT = "imagine:voice-profiles-changed";

export type VoiceProfileSource = "builtin" | "designed" | "cloned" | "imported";

export interface VoiceProfile {
  id: string;
  name: string;
  provider: AiProvider;
  source: VoiceProfileSource;
  description?: string;
  tags: string[];
  providerVoiceId?: string;
  designPrompt?: string;
  referenceAudioAssetIds: string[];
  sourceAssetIds?: string[];
  consentAcceptedAt?: string;
  previewAudioAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export type VoiceProfileInput = Omit<VoiceProfile, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

const BUILT_IN_PROFILE_TIMESTAMP = "2026-06-07T00:00:00.000Z";

export const VOICE_PROFILE_TAG_GROUPS = [
  { key: "gender", label: "性别", tags: ["男声", "女声", "中性"] },
  { key: "age", label: "年龄", tags: ["儿童", "青年", "中年", "老人"] },
  { key: "scene", label: "场景", tags: ["广告", "自然", "纪录", "综艺", "新闻", "旁白", "播客", "角色"] },
  { key: "texture", label: "质感", tags: ["清亮", "磁性", "沙哑", "甜美", "沉稳", "活泼"] },
] as const;

export const VOICE_PROFILE_TAG_OPTIONS = VOICE_PROFILE_TAG_GROUPS.flatMap(group => group.tags);
type VoiceProfileTagGroup = (typeof VOICE_PROFILE_TAG_GROUPS)[number];
type VoiceProfileTag = (typeof VOICE_PROFILE_TAG_OPTIONS)[number];

const VOICE_PROFILE_TAG_KEYS: Record<VoiceProfileTag, string> = {
  儿童: "child",
  中年: "middleAged",
  中性: "neutral",
  旁白: "narration",
  新闻: "news",
  沙哑: "raspy",
  沉稳: "calm",
  活泼: "lively",
  清亮: "clear",
  甜美: "sweet",
  男声: "male",
  磁性: "magnetic",
  女声: "female",
  老人: "elder",
  自然: "natural",
  纪录: "documentary",
  综艺: "variety",
  角色: "character",
  青年: "young",
  广告: "ad",
  播客: "podcast",
};

export function voiceProfileTagGroupLabel(group: VoiceProfileTagGroup, labelT: TFunction): string {
  return labelT(`voiceProfile.tagGroups.${group.key}.label`);
}

export function voiceProfileTagLabel(tag: string, labelT: TFunction): string {
  return tag in VOICE_PROFILE_TAG_KEYS
    ? labelT(`voiceProfile.tags.${VOICE_PROFILE_TAG_KEYS[tag as VoiceProfileTag]}`)
    : tag;
}

export interface SaveClonedVoiceProfileInput {
  name: string;
  description?: string;
  tags: string[];
  fallbackProvider: AiProvider;
}

export const BUILT_IN_VOICE_PROFILES: VoiceProfile[] = MIMO_BUILT_IN_VOICES.map(voice => ({
  id: `mimo_builtin_${voice}`,
  name: voice === "mimo_default" ? "MiMo Default" : voice,
  provider: "mimo",
  source: "builtin",
  tags: [],
  providerVoiceId: voice,
  referenceAudioAssetIds: [],
  createdAt: BUILT_IN_PROFILE_TIMESTAMP,
  updatedAt: BUILT_IN_PROFILE_TIMESTAMP,
}));

function getBuiltInVoiceProfile(id: string): VoiceProfile | null {
  return BUILT_IN_VOICE_PROFILES.find(profile => profile.id === id) ?? null;
}

export function isBuiltInVoiceProfileId(id: string): boolean {
  return getBuiltInVoiceProfile(id) !== null;
}

export function getVisibleVoiceProfilesForAudioModel(
  model: string,
  mode: AudioOperationMode,
  savedProfiles: VoiceProfile[],
): VoiceProfile[] {
  const parsedModel = tryParseProviderModel(model, "12ai");
  if (!parsedModel) return [];
  const providerProfiles = savedProfiles.filter(profile => isVoiceProfileUsableForAudioModel(profile, model, mode));
  if (mode === "tts" && parsedModel.provider === "mimo" && parsedModel.model === "mimo-v2.5-tts") {
    return [...BUILT_IN_VOICE_PROFILES, ...providerProfiles];
  }
  return providerProfiles;
}

export function isVoiceProfileUsableForAudioModel(
  profile: VoiceProfile,
  model: string,
  mode: AudioOperationMode,
): boolean {
  const parsedModel = tryParseProviderModel(model, "12ai");
  if (!parsedModel) return false;
  if (profile.source === "builtin") {
    return mode === "tts" && parsedModel.provider === "mimo" && parsedModel.model === "mimo-v2.5-tts";
  }

  const capabilities = getAudioModelCapabilities(model);
  if (!capabilities.modes.includes(mode)) return false;
  if (profile.source === "cloned") {
    const withinMin = profile.referenceAudioAssetIds.length >= capabilities.minReferenceMedia;
    const withinMax = capabilities.maxReferenceMedia === 0 || profile.referenceAudioAssetIds.length <= capabilities.maxReferenceMedia;
    return mode === "voice_clone" && capabilities.referenceMediaTypes.includes("audio") && withinMin && withinMax;
  }
  return profile.provider === parsedModel.provider;
}

export function voiceProfileDefaultNameFromAsset(item: Pick<StorageItem, "prompt" | "createdAt">, labelT: TFunction = globalT): string {
  const prompt = item.prompt.trim();
  if (prompt) return prompt.slice(0, 24);
  const date = new Date(item.createdAt);
  const defaultName = labelT("voiceProfile.defaultCloneName");
  if (!Number.isFinite(date.getTime())) return defaultName;
  return `${defaultName} ${date.toLocaleDateString()}`;
}

export async function saveClonedVoiceProfileFromAsset(
  item: Pick<StorageItem, "id" | "type" | "prompt" | "model" | "createdAt">,
  input: SaveClonedVoiceProfileInput,
): Promise<VoiceProfile> {
  if (item.type !== "audio") throw new Error(globalT("common.voiceProfile.audioAssetRequired"));
  const name = input.name.trim();
  if (!name) throw new Error(globalT("common.voiceProfile.validationEmptyName"));
  const parsedProvider = tryParseProviderModel(item.model, input.fallbackProvider)?.provider ?? input.fallbackProvider;
  const now = new Date().toISOString();
  return saveVoiceProfile({
    id: `voice_${Date.now()}`,
    name,
    provider: parsedProvider,
    source: "cloned",
    description: input.description?.trim() || undefined,
    tags: input.tags,
    referenceAudioAssetIds: [item.id],
    sourceAssetIds: [item.id],
    consentAcceptedAt: now,
  });
}

function normalizeVoiceProfile(input: VoiceProfile): VoiceProfile {
  const referenceAudioAssetIds = input.referenceAudioAssetIds.filter(id => id.trim().length > 0);
  const sourceAssetIds = input.sourceAssetIds?.filter(id => id.trim().length > 0) ?? referenceAudioAssetIds;
  return {
    id: input.id,
    name: input.name.trim(),
    provider: input.provider,
    source: input.source,
    description: input.description?.trim() || undefined,
    tags: Array.from(new Set((input.tags ?? []).map(tag => tag.trim()).filter(tag => tag.length > 0))),
    providerVoiceId: input.providerVoiceId?.trim() || undefined,
    designPrompt: input.designPrompt?.trim() || undefined,
    referenceAudioAssetIds,
    sourceAssetIds,
    consentAcceptedAt: input.consentAcceptedAt?.trim() || undefined,
    previewAudioAssetId: input.previewAudioAssetId?.trim() || undefined,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function toVoiceProfile(input: VoiceProfileInput): VoiceProfile {
  const now = new Date().toISOString();
  return normalizeVoiceProfile({
    ...input,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  });
}

function openVoiceProfileDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("VoiceProfile storage is only available in the browser"));
      return;
    }

    const request = indexedDB.open(VOICE_DB_NAME, VOICE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOICE_PROFILE_STORE)) {
        const store = db.createObjectStore(VOICE_PROFILE_STORE, { keyPath: "id" });
        store.createIndex("by_provider", "provider", { unique: false });
        store.createIndex("by_source", "source", { unique: false });
        store.createIndex("by_updatedAt", "updatedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("VoiceProfile database open failed"));
  });
}

export async function saveVoiceProfile(input: VoiceProfileInput): Promise<VoiceProfile> {
  const profile = toVoiceProfile(input);
  if (await isPostgresStorageActive()) {
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) throw new Error("CSRF token is required");
    const result = await saveTeamVoiceProfile(profile, csrfToken);
    dispatchVoiceProfilesChanged();
    return normalizeVoiceProfile(result.profile);
  }

  const db = await openVoiceProfileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readwrite");
    transaction.objectStore(VOICE_PROFILE_STORE).put(profile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("VoiceProfile save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("VoiceProfile save aborted"));
  });
  dispatchVoiceProfilesChanged();
  return profile;
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  if (await isPostgresStorageActive()) {
    const result = await fetchTeamVoiceProfiles();
    return sortVoiceProfiles(result.profiles.map(normalizeVoiceProfile));
  }

  const db = await openVoiceProfileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readonly");
    const request = transaction.objectStore(VOICE_PROFILE_STORE).getAll();
    request.onsuccess = () => {
      const profiles = (request.result as VoiceProfile[]).map(normalizeVoiceProfile);
      resolve(sortVoiceProfiles(profiles));
    };
    request.onerror = () => reject(request.error ?? new Error("VoiceProfile list failed"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("VoiceProfile list transaction failed"));
  });
}

export async function getVoiceProfile(id: string): Promise<VoiceProfile | null> {
  const builtInProfile = getBuiltInVoiceProfile(id);
  if (builtInProfile) return builtInProfile;

  if (await isPostgresStorageActive()) {
    const result = await fetchTeamVoiceProfiles();
    return result.profiles.map(normalizeVoiceProfile).find(profile => profile.id === id) ?? null;
  }

  const db = await openVoiceProfileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readonly");
    const request = transaction.objectStore(VOICE_PROFILE_STORE).get(id);
    request.onsuccess = () => {
      const profile = request.result as VoiceProfile | undefined;
      resolve(profile ? normalizeVoiceProfile(profile) : null);
    };
    request.onerror = () => reject(request.error ?? new Error("VoiceProfile read failed"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("VoiceProfile read transaction failed"));
  });
}

export async function deleteVoiceProfile(id: string): Promise<void> {
  if (await isPostgresStorageActive()) {
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) throw new Error("CSRF token is required");
    await deleteTeamVoiceProfile(id, csrfToken);
    dispatchVoiceProfilesChanged();
    return;
  }

  const db = await openVoiceProfileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readwrite");
    transaction.objectStore(VOICE_PROFILE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("VoiceProfile delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("VoiceProfile delete aborted"));
  });
  dispatchVoiceProfilesChanged();
}

async function isPostgresStorageActive(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return (await fetchWorkspaceStorageRuntimeStatus()).targetKind === "postgres";
}

function sortVoiceProfiles(profiles: VoiceProfile[]): VoiceProfile[] {
  return profiles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function dispatchVoiceProfilesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(VOICE_PROFILES_CHANGED_EVENT));
  }
}
