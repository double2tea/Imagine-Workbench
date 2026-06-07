import { useState, type ChangeEvent, type Dispatch, type DragEvent, type SetStateAction } from "react";
import {
  type DraggedReferenceAsset,
  makeReferenceDropToken,
  readDraggedReferenceAsset,
} from "@/components/reference/referenceDrag";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import {
  getMediaReferencePromptToken,
  getMediaReferenceType,
  mediaReferenceLabel,
  mediaReferenceTypeFromLabel,
  mediaReferenceTypeFromMime,
  type MediaReferenceType,
} from "@/lib/media-references";
import type { VideoReferenceMode } from "@/lib/providers/model-catalog";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, compressReferenceImageFile } from "@/lib/reference-images";
import { toErrorMessage } from "@/lib/client-fetch-error";

export type AtDropdownTarget = "image-prompt" | "video-prompt" | "agent-prompt";
type PromptReferenceTarget = Exclude<AtDropdownTarget, "agent-prompt">;
type NoticeType = "error" | "info" | "success";

export const IMAGE_REFERENCE_LIMIT = 4;

interface AtDropdownState {
  visible: boolean;
  type: AtDropdownTarget;
  search: string;
}

interface UseReferenceStateParams {
  agentInput: string;
  imageReferenceLimit: number;
  imageReferenceMediaTypes: MediaReferenceType[];
  prompt: string;
  videoReferenceLimit: number;
  videoReferenceMediaTypes: MediaReferenceType[];
  videoReferenceMode: VideoReferenceMode;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  setAgentInput: Dispatch<SetStateAction<string>>;
  setPrompt: Dispatch<SetStateAction<string>>;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("文件读取结果不是 Data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function getRawMediaFileSizeError(file: File, type: MediaReferenceType): string | null {
  if (type === "image") return null;
  const maxRawBytes = Math.floor(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES * 0.75);
  if (file.size <= maxRawBytes) return null;
  return `${mediaReferenceLabel(type)}参考文件过大，请压缩到 ${Math.floor(maxRawBytes / 1024 / 1024)}MB 以内后重试`;
}

export function getReferencePromptToken(index: number, type: MediaReferenceType = "image"): string {
  return getMediaReferencePromptToken(index, type);
}

function getAcceptedReferencePromptTokens(index: number, type: MediaReferenceType): string[] {
  const token = getReferencePromptToken(index, type);
  const legacyToken = getReferencePromptToken(index);
  return token === legacyToken ? [token] : [token, legacyToken];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPromptWithReferenceMap(
  prompt: string,
  references: ReferenceImageRef[],
  sentReferenceUrls = references.map(reference => reference.url),
): string {
  const lines = references
    .flatMap((reference, index) => {
      const sentIndex = sentReferenceUrls.findIndex(url => url === reference.url);
      return getAcceptedReferencePromptTokens(index, getMediaReferenceType(reference)).map(token => ({ sentIndex, token }));
    })
    .filter(reference => reference.sentIndex !== -1)
    .filter(reference => new RegExp(`${escapeRegExp(reference.token)}(?!\\d)`).test(prompt))
    .map(reference => `- ${reference.token} = reference media ${reference.sentIndex + 1}`);

  if (lines.length === 0) return prompt;
  return `Reference mapping:\n${lines.join("\n")}\n\nUser prompt:\n${prompt}`;
}

function insertTextAtRange(value: string, start: number, end: number, text: string): string {
  return `${value.slice(0, start)}${text}${value.slice(end)}`;
}

function remapPromptAfterReferenceRemoval(prompt: string, removedIndex: number): string {
  return prompt.replace(/@(图片|视频|音频)(\d+)/g, (match, label, value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return match;

    const index = parsed - 1;
    if (index === removedIndex) return "";
    if (index > removedIndex) return getReferencePromptToken(index - 1, mediaReferenceTypeFromLabel(label) ?? "image");
    return match;
  });
}

export function removePromptReferenceTokens(prompt: string): string {
  return prompt.replace(/@(图片|视频|音频)\d+/g, "");
}

export function useReferenceState({
  agentInput,
  imageReferenceLimit,
  imageReferenceMediaTypes,
  prompt,
  videoReferenceLimit,
  videoReferenceMediaTypes,
  videoReferenceMode,
  pushWorkspaceNotice,
  setAgentInput,
  setPrompt,
}: UseReferenceStateParams) {
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImageRef[]>([]);
  const [agentReferences, setAgentReferences] = useState<ReferenceImageRef[]>([]);
  const [agentReferenceId, setAgentReferenceId] = useState<string | null>(null);
  const [agentReferenceUrl, setAgentReferenceUrl] = useState<string | null>(null);
  const [atDropdown, setAtDropdown] = useState<AtDropdownState>({
    visible: false,
    type: "image-prompt",
    search: "",
  });

  const getReferenceLimitForTarget = (target: PromptReferenceTarget): number =>
    target === "video-prompt" ? videoReferenceLimit : imageReferenceLimit;

  const getAcceptedMediaTypesForTarget = (target: PromptReferenceTarget): MediaReferenceType[] =>
    target === "video-prompt" ? videoReferenceMediaTypes : imageReferenceMediaTypes;

  const isAcceptedReferenceType = (type: MediaReferenceType, target: PromptReferenceTarget): boolean =>
    getAcceptedMediaTypesForTarget(target).includes(type);

  const getDroppedReferenceRole = (target: PromptReferenceTarget, index: number): ReferenceImageRef["role"] => {
    if (target !== "video-prompt" || videoReferenceMode !== "firstLast") return "general";
    if (index === 0) return "start";
    if (index === 1) return "end";
    return "general";
  };

  const addDroppedReferenceAsset = (asset: DraggedReferenceAsset, target: PromptReferenceTarget): number | null => {
    const type = getMediaReferenceType(asset);
    if (!isAcceptedReferenceType(type, target)) {
      pushWorkspaceNotice("error", `当前输入不支持${mediaReferenceLabel(type)}参考`);
      return null;
    }
    const existingIndex = referenceImages.findIndex(reference => reference.id === asset.id);
    if (existingIndex !== -1) return existingIndex;

    const limit = getReferenceLimitForTarget(target);
    if (referenceImages.length >= limit) {
      pushWorkspaceNotice("error", `参考图已达上限：最多 ${limit} 张`);
      return null;
    }

    const nextIndex = referenceImages.length;
    const nextReference: ReferenceImageRef = {
      id: asset.id,
      type,
      url: asset.url,
      role: getDroppedReferenceRole(target, nextIndex),
    };

    setReferenceImage(referenceImages[0]?.url ?? asset.url);
    setReferenceImages(prev => {
      if (prev.some(reference => reference.id === asset.id)) return prev;
      if (prev.length >= limit) return prev;
      return [...prev, nextReference];
    });
    return nextIndex;
  };

  const handleReferenceDropAsset = (asset: DraggedReferenceAsset, target: PromptReferenceTarget) => {
    addDroppedReferenceAsset(asset, target);
  };

  const addReferenceMediaFile = async (file: File, target: PromptReferenceTarget, id: string) => {
    const type = mediaReferenceTypeFromMime(file.type);
    if (!type || !isAcceptedReferenceType(type, target)) {
      pushWorkspaceNotice("error", `当前输入不支持${type ? mediaReferenceLabel(type) : "该媒体"}参考`);
      return;
    }
    const limit = getReferenceLimitForTarget(target);
    if (referenceImages.length >= limit) {
      pushWorkspaceNotice("error", `参考图已达上限：最多 ${limit} 张`);
      return;
    }
    const fileSizeError = getRawMediaFileSizeError(file, type);
    if (fileSizeError) {
      pushWorkspaceNotice("error", fileSizeError);
      return;
    }

    try {
      const dataUrl = type === "image" ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file);
      setReferenceImages(prev => {
        if (prev.some(reference => reference.id === id)) return prev;
        if (prev.length >= limit) return prev;

        const nextReference: ReferenceImageRef = {
          id,
          type,
          url: dataUrl,
          role: getDroppedReferenceRole(target, prev.length),
        };
        if (prev.length === 0) {
          setReferenceImage(dataUrl);
        }
        return [...prev, nextReference];
      });
    } catch (error) {
      console.error(error);
      pushWorkspaceNotice("error", toErrorMessage(error, `${mediaReferenceLabel(type)}参考读取失败`));
    }
  };

  const handleReferenceDropFiles = (files: File[], target: PromptReferenceTarget) => {
    const limit = getReferenceLimitForTarget(target);
    const availableSlots = limit - referenceImages.length;
    if (availableSlots <= 0) {
      pushWorkspaceNotice("error", `参考图已达上限：最多 ${limit} 张`);
      return;
    }

    files.slice(0, availableSlots).forEach((file, index) => {
      void addReferenceMediaFile(file, target, `${makeClientId("drop")}_${index}`);
    });
  };

  const handlePromptDropAsset = (event: DragEvent<HTMLTextAreaElement>, target: PromptReferenceTarget) => {
    const asset = readDraggedReferenceAsset(event.dataTransfer);
    if (!asset) return;

    const textarea = event.currentTarget;
    const dropToken = makeReferenceDropToken(asset.id);
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const referenceIndex = addDroppedReferenceAsset(asset, target);

    window.setTimeout(() => {
      const currentValue = textarea.value;
      if (referenceIndex === null) {
        setPrompt(currentValue.replace(dropToken, ""));
        return;
      }

      const referenceToken = getReferencePromptToken(referenceIndex, getMediaReferenceType(asset));
      const nextPrompt = currentValue.includes(dropToken)
        ? currentValue.replace(dropToken, referenceToken)
        : insertTextAtRange(currentValue, selectionStart, selectionEnd, referenceToken);

      setPrompt(nextPrompt);
      setAtDropdown({ visible: false, type: target, search: "" });
    }, 0);
  };

  const handleReferenceUpload = (event: ChangeEvent<HTMLInputElement>, target: PromptReferenceTarget) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    void addReferenceMediaFile(file, target, makeClientId("upload"));
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    handleReferenceUpload(event, "image-prompt");
  };

  const removeReferenceImage = (id: string) => {
    const removedIndex = referenceImages.findIndex(reference => reference.id === id);
    if (removedIndex !== -1) {
      setPrompt(current => remapPromptAfterReferenceRemoval(current, removedIndex));
    }

    setReferenceImages(prev => {
      const filtered = prev.filter(reference => reference.id !== id);
      setReferenceImage(filtered[0]?.url ?? null);
      return filtered;
    });
  };

  const toggleReferenceRole = (id: string, role: "start" | "end" | "general") => {
    setReferenceImages(prev => prev.map(reference => {
      if (reference.id === id) {
        return { ...reference, role };
      }
      if ((role === "start" || role === "end") && reference.role === role) {
        return { ...reference, role: "general" };
      }
      return reference;
    }));
  };

  const handleTextareaChange = (value: string, type: AtDropdownTarget) => {
    if (type === "agent-prompt") {
      setAgentInput(value);
    } else {
      setPrompt(value);
    }

    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1 && lastAtIndex >= value.length - 15) {
      const searchPart = value.substring(lastAtIndex + 1);
      if (!searchPart.includes(" ") && !searchPart.includes("\n")) {
        setAtDropdown({ visible: true, type, search: searchPart });
        return;
      }
    }
    setAtDropdown({ visible: false, type, search: "" });
  };

  const handleSelectPromptReference = (index: number, type: PromptReferenceTarget) => {
    const lastAtIndex = prompt.lastIndexOf("@");
    const base = lastAtIndex !== -1 ? prompt.substring(0, lastAtIndex) : prompt;
    const searchLength = atDropdown.visible && atDropdown.type === type ? atDropdown.search.length : 0;
    const suffixStart = lastAtIndex === -1 ? prompt.length : lastAtIndex + 1 + searchLength;
    const suffix = prompt.substring(suffixStart);
    const reference = referenceImages[index];
    if (!reference) throw new Error("选择的参考媒体不存在");
    setPrompt(`${base}${getReferencePromptToken(index, getMediaReferenceType(reference))} ${suffix}`);
    setAtDropdown({ visible: false, type, search: "" });
  };

  const handleSelectAtItem = (itemUrl: string, itemId: string, target: AtDropdownTarget, itemType: MediaReferenceType = "image") => {
    if (target === "agent-prompt") {
      if (itemType !== "image") {
        pushWorkspaceNotice("error", `Agent 暂不支持${mediaReferenceLabel(itemType)}引用`);
        return;
      }
      const lastAtIndex = agentInput.lastIndexOf("@");
      const base = lastAtIndex !== -1 ? agentInput.substring(0, lastAtIndex) : agentInput;
      setAgentInput(`${base}[Ref: ${itemId}] `);
      setAgentReferenceId(itemId);
      setAgentReferenceUrl(itemUrl);
      setAgentReferences(prev => {
        if (prev.some(reference => reference.id === itemId)) return prev;
        return [...prev, { id: itemId, type: itemType, url: itemUrl }];
      });
    } else {
      if (!isAcceptedReferenceType(itemType, target)) {
        pushWorkspaceNotice("error", `当前输入不支持${mediaReferenceLabel(itemType)}参考`);
        return;
      }
      const lastAtIndex = prompt.lastIndexOf("@");
      const base = lastAtIndex !== -1 ? prompt.substring(0, lastAtIndex) : prompt;
      setPrompt(`${base}[Ref: ${itemId}] `);
      setReferenceImage(itemUrl);
      setReferenceImages(prev => {
        if (prev.some(reference => reference.id === itemId)) return prev;
        const role =
          target === "video-prompt" && videoReferenceMode === "firstLast"
            ? prev.length === 1
              ? "end"
              : prev.length === 0
                ? "start"
                : "general"
            : "general";
        return [...prev, { id: itemId, type: itemType, url: itemUrl, role }];
      });
    }
    setAtDropdown({ visible: false, type: target, search: "" });
  };

  return {
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    atDropdown,
    handleImageUpload,
    handleReferenceUpload,
    handlePromptDropAsset,
    handleReferenceDropAsset,
    handleReferenceDropFiles,
    handleSelectAtItem,
    handleSelectPromptReference,
    handleTextareaChange,
    referenceImage,
    referenceImages,
    removeReferenceImage,
    setAgentReferenceId,
    setAgentReferences,
    setAgentReferenceUrl,
    setAtDropdown,
    setReferenceImage,
    setReferenceImages,
    toggleReferenceRole,
  };
}
