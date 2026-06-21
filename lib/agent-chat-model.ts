import {
  getMediaReferenceType,
  mediaReferenceLabel,
  mediaReferenceMimeFromBase64DataUri,
  type MediaReferenceType,
} from "./media-references";
import { t } from "./i18n";

export interface AgentReferenceInput {
  id: string;
  type?: MediaReferenceType;
  url: string;
}

export interface AgentReferenceInputSupport {
  audio: boolean | null;
  image: boolean | null;
  video: boolean | null;
}

export interface AgentAudioInput {
  data: string;
  format: string;
}

const AUDIO_FORMAT_BY_MIME = new Map<string, string>([
  ["audio/aac", "aac"],
  ["audio/aiff", "aiff"],
  ["audio/flac", "flac"],
  ["audio/m4a", "m4a"],
  ["audio/mp3", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-aiff", "aiff"],
  ["audio/x-m4a", "m4a"],
  ["audio/x-wav", "wav"],
]);

export function isSendableAgentImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  );
}

export function parseAgentAudioDataUrl(url: string): AgentAudioInput | null {
  const trimmed = url.trim();
  const mimeType = mediaReferenceMimeFromBase64DataUri(trimmed);
  if (!mimeType?.startsWith("audio/")) return null;

  const format = AUDIO_FORMAT_BY_MIME.get(mimeType);
  if (!format) return null;

  const marker = ";base64,";
  const markerIndex = trimmed.indexOf(marker);
  const data = markerIndex >= 0 ? trimmed.slice(markerIndex + marker.length) : "";
  if (!data.trim()) return null;

  return { data, format };
}

export function isSendableAgentMediaReference(reference: AgentReferenceInput): boolean {
  const type = getMediaReferenceType(reference);
  const trimmed = reference.url.trim();
  if (!trimmed) return false;

  if (type === "image") return isSendableAgentImageUrl(trimmed);
  if (type === "video") {
    return (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      (trimmed.startsWith("data:video/") && mediaReferenceMimeFromBase64DataUri(trimmed) !== null)
    );
  }
  return parseAgentAudioDataUrl(trimmed) !== null;
}

export function normalizeAgentReferences(
  references: AgentReferenceInput[],
  agentReferenceId?: string | null,
  agentReferenceUrl?: string | null,
): AgentReferenceInput[] {
  const byId = new Map<string, AgentReferenceInput>();

  for (const reference of references) {
    if (!reference.id.trim()) continue;
    byId.set(reference.id, { id: reference.id, type: getMediaReferenceType(reference), url: reference.url });
  }

  if (agentReferenceId?.trim() && agentReferenceUrl && isSendableAgentImageUrl(agentReferenceUrl)) {
    byId.set(agentReferenceId, { id: agentReferenceId, type: "image", url: agentReferenceUrl });
  }

  return [...byId.values()];
}

export function getSendableAgentMediaReferences(
  references: AgentReferenceInput[],
  agentReferenceId?: string | null,
  agentReferenceUrl?: string | null,
): AgentReferenceInput[] {
  return normalizeAgentReferences(references, agentReferenceId, agentReferenceUrl).filter(isSendableAgentMediaReference);
}

export function getSendableAgentImageReferences(
  references: AgentReferenceInput[],
  agentReferenceId?: string | null,
  agentReferenceUrl?: string | null,
): AgentReferenceInput[] {
  return getSendableAgentMediaReferences(references, agentReferenceId, agentReferenceUrl).filter(
    reference => getMediaReferenceType(reference) === "image",
  );
}

function coerceInputSupport(
  support: boolean | null | Partial<AgentReferenceInputSupport>,
): AgentReferenceInputSupport {
  if (typeof support === "boolean" || support === null) {
    return { audio: null, image: support, video: null };
  }
  return {
    audio: typeof support.audio === "boolean" ? support.audio : null,
    image: typeof support.image === "boolean" ? support.image : null,
    video: typeof support.video === "boolean" ? support.video : null,
  };
}

function formatReferenceCountLabel(sendableReferences: AgentReferenceInput[]): string {
  const counts = new Map<MediaReferenceType, number>([
    ["image", 0],
    ["video", 0],
    ["audio", 0],
  ]);
  for (const reference of sendableReferences) {
    const type = getMediaReferenceType(reference);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return (["image", "video", "audio"] satisfies MediaReferenceType[])
    .map(type => {
      const count = counts.get(type) ?? 0;
      if (count === 0) return null;
      return t("common.agentReference.countItem", {
        count,
        type: mediaReferenceLabel(type, t),
        unit: t(`common.agentReference.units.${type}`),
      });
    })
    .filter((label): label is string => label !== null)
    .join(t("common.agentReference.separator"));
}

function collectReferencedTypes(sendableReferences: AgentReferenceInput[]): MediaReferenceType[] {
  const seen = new Set<MediaReferenceType>();
  for (const reference of sendableReferences) {
    seen.add(getMediaReferenceType(reference));
  }
  return (["image", "video", "audio"] satisfies MediaReferenceType[]).filter(type => seen.has(type));
}

export function formatAgentReferenceHint(
  sendableReferences: AgentReferenceInput[],
  openRouterInputSupport: boolean | null | Partial<AgentReferenceInputSupport> = null,
): string | undefined {
  if (sendableReferences.length === 0) return undefined;

  const inputSupport = coerceInputSupport(openRouterInputSupport);
  const countLabel = formatReferenceCountLabel(sendableReferences);
  const referencedTypes = collectReferencedTypes(sendableReferences);
  const unsupportedLabels = referencedTypes
    .filter(type => inputSupport[type] === false)
    .map(type => mediaReferenceLabel(type, t));

  if (unsupportedLabels.length > 0) {
    return t("common.agentReference.unsupportedHint", {
      countLabel,
      unsupported: unsupportedLabels.join("/"),
    });
  }

  const supportedLabels = referencedTypes
    .filter(type => inputSupport[type] === true)
    .map(type => mediaReferenceLabel(type, t));
  if (supportedLabels.length === referencedTypes.length) {
    return t("common.agentReference.supportedHint", {
      countLabel,
      supported: supportedLabels.join("/"),
    });
  }
  return t("common.agentReference.unknownHint", { countLabel });
}
