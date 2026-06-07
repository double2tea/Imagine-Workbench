import type { AiProvider } from "./providers/model-catalog";
import { tryParseProviderModel, type AudioOperationMode } from "./providers/model-catalog";
import { MIMO_BUILT_IN_VOICES } from "./providers/mimo-voices";

const VOICE_DB_NAME = "ImagineWorkbenchVoiceDB";
const VOICE_DB_VERSION = 1;
const VOICE_PROFILE_STORE = "voice_profiles";

export type VoiceProfileSource = "builtin" | "designed" | "cloned" | "imported";

export interface VoiceProfile {
  id: string;
  name: string;
  provider: AiProvider;
  source: VoiceProfileSource;
  providerVoiceId?: string;
  designPrompt?: string;
  referenceAudioAssetIds: string[];
  previewAudioAssetId?: string;
  createdAt: string;
  updatedAt: string;
}

export type VoiceProfileInput = Omit<VoiceProfile, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

const BUILT_IN_PROFILE_TIMESTAMP = "2026-06-07T00:00:00.000Z";

export const BUILT_IN_VOICE_PROFILES: VoiceProfile[] = MIMO_BUILT_IN_VOICES.map(voice => ({
  id: `mimo_builtin_${voice}`,
  name: voice === "mimo_default" ? "MiMo 默认" : voice,
  provider: "mimo",
  source: "builtin",
  providerVoiceId: voice,
  referenceAudioAssetIds: [],
  createdAt: BUILT_IN_PROFILE_TIMESTAMP,
  updatedAt: BUILT_IN_PROFILE_TIMESTAMP,
}));

function getBuiltInVoiceProfile(id: string): VoiceProfile | null {
  return BUILT_IN_VOICE_PROFILES.find(profile => profile.id === id) ?? null;
}

export function getVisibleVoiceProfilesForAudioModel(
  model: string,
  mode: AudioOperationMode,
  savedProfiles: VoiceProfile[],
): VoiceProfile[] {
  const parsedModel = tryParseProviderModel(model, "12ai");
  if (!parsedModel) return [];
  const providerProfiles = savedProfiles.filter(profile => profile.provider === parsedModel.provider && profile.source !== "builtin");
  if (mode === "tts" && parsedModel.provider === "mimo" && parsedModel.model === "mimo-v2.5-tts") {
    return [...BUILT_IN_VOICE_PROFILES, ...providerProfiles];
  }
  return providerProfiles;
}

function normalizeVoiceProfile(input: VoiceProfile): VoiceProfile {
  return {
    id: input.id,
    name: input.name.trim(),
    provider: input.provider,
    source: input.source,
    providerVoiceId: input.providerVoiceId?.trim() || undefined,
    designPrompt: input.designPrompt?.trim() || undefined,
    referenceAudioAssetIds: input.referenceAudioAssetIds.filter(id => id.trim().length > 0),
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
  const db = await openVoiceProfileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readwrite");
    transaction.objectStore(VOICE_PROFILE_STORE).put(profile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("VoiceProfile save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("VoiceProfile save aborted"));
  });
  return profile;
}

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const db = await openVoiceProfileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readonly");
    const request = transaction.objectStore(VOICE_PROFILE_STORE).getAll();
    request.onsuccess = () => {
      const profiles = (request.result as VoiceProfile[]).map(normalizeVoiceProfile);
      resolve(profiles.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()));
    };
    request.onerror = () => reject(request.error ?? new Error("VoiceProfile list failed"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("VoiceProfile list transaction failed"));
  });
}

export async function getVoiceProfile(id: string): Promise<VoiceProfile | null> {
  const builtInProfile = getBuiltInVoiceProfile(id);
  if (builtInProfile) return builtInProfile;

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
  const db = await openVoiceProfileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(VOICE_PROFILE_STORE, "readwrite");
    transaction.objectStore(VOICE_PROFILE_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("VoiceProfile delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("VoiceProfile delete aborted"));
  });
}
