import { useState, type ChangeEvent, type Dispatch, type DragEvent, type SetStateAction } from "react";
import {
  type DraggedReferenceAsset,
  makeReferenceDropToken,
  readDraggedReferenceAsset,
} from "@/components/reference/referenceDrag";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { VideoReferenceMode } from "@/lib/providers/model-catalog";

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
  prompt: string;
  videoReferenceLimit: number;
  videoReferenceMode: VideoReferenceMode;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  setAgentInput: Dispatch<SetStateAction<string>>;
  setPrompt: Dispatch<SetStateAction<string>>;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

export function getReferencePromptToken(index: number): string {
  return `@图片${index + 1}`;
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
    .map((reference, index) => ({
      sentIndex: sentReferenceUrls.findIndex(url => url === reference.url),
      token: getReferencePromptToken(index),
    }))
    .filter(reference => reference.sentIndex !== -1)
    .filter(reference => new RegExp(`${escapeRegExp(reference.token)}(?!\\d)`).test(prompt))
    .map(reference => `- ${reference.token} = reference image ${reference.sentIndex + 1}`);

  if (lines.length === 0) return prompt;
  return `Reference mapping:\n${lines.join("\n")}\n\nUser prompt:\n${prompt}`;
}

function insertTextAtRange(value: string, start: number, end: number, text: string): string {
  return `${value.slice(0, start)}${text}${value.slice(end)}`;
}

function remapPromptAfterReferenceRemoval(prompt: string, removedIndex: number): string {
  return prompt.replace(/@图片(\d+)/g, (match, value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return match;

    const index = parsed - 1;
    if (index === removedIndex) return "";
    if (index > removedIndex) return getReferencePromptToken(index - 1);
    return match;
  });
}

export function removePromptReferenceTokens(prompt: string): string {
  return prompt.replace(/@图片\d+/g, "");
}

export function useReferenceState({
  agentInput,
  prompt,
  videoReferenceLimit,
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
    target === "video-prompt" ? videoReferenceLimit : IMAGE_REFERENCE_LIMIT;

  const getDroppedReferenceRole = (target: PromptReferenceTarget, index: number): ReferenceImageRef["role"] => {
    if (target !== "video-prompt" || videoReferenceMode !== "firstLast") return "general";
    if (index === 0) return "start";
    if (index === 1) return "end";
    return "general";
  };

  const addDroppedReferenceAsset = (asset: DraggedReferenceAsset, target: PromptReferenceTarget): number | null => {
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

  const addReferenceImageFile = (file: File, target: PromptReferenceTarget, id: string) => {
    const limit = getReferenceLimitForTarget(target);
    if (referenceImages.length >= limit) {
      pushWorkspaceNotice("error", `参考图已达上限：最多 ${limit} 张`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      if (typeof base64 !== "string") {
        throw new Error("Unable to read reference image file");
      }

      setReferenceImages(prev => {
        if (prev.some(reference => reference.id === id)) return prev;
        if (prev.length >= limit) return prev;

        const nextReference: ReferenceImageRef = {
          id,
          url: base64,
          role: getDroppedReferenceRole(target, prev.length),
        };
        if (prev.length === 0) {
          setReferenceImage(base64);
        }
        return [...prev, nextReference];
      });
    };
    reader.readAsDataURL(file);
  };

  const handleReferenceDropFiles = (files: File[], target: PromptReferenceTarget) => {
    const limit = getReferenceLimitForTarget(target);
    const availableSlots = limit - referenceImages.length;
    if (availableSlots <= 0) {
      pushWorkspaceNotice("error", `参考图已达上限：最多 ${limit} 张`);
      return;
    }

    files.slice(0, availableSlots).forEach((file, index) => {
      addReferenceImageFile(file, target, `${makeClientId("drop")}_${index}`);
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

      const referenceToken = getReferencePromptToken(referenceIndex);
      const nextPrompt = currentValue.includes(dropToken)
        ? currentValue.replace(dropToken, referenceToken)
        : insertTextAtRange(currentValue, selectionStart, selectionEnd, referenceToken);

      setPrompt(nextPrompt);
      setAtDropdown({ visible: false, type: target, search: "" });
    }, 0);
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result;
      if (typeof base64 !== "string") {
        throw new Error("Unable to read reference image file");
      }
      const newReferenceId = makeClientId("upload");

      setReferenceImage(base64);
      setReferenceImages(prev => {
        if (prev.some(reference => reference.id === newReferenceId)) return prev;
        return [...prev, { id: newReferenceId, url: base64, role: "general" }];
      });
    };
    reader.readAsDataURL(file);
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
    setPrompt(`${base}${getReferencePromptToken(index)} ${suffix}`);
    setAtDropdown({ visible: false, type, search: "" });
  };

  const handleSelectAtItem = (itemUrl: string, itemId: string, type: AtDropdownTarget) => {
    if (type === "agent-prompt") {
      const lastAtIndex = agentInput.lastIndexOf("@");
      const base = lastAtIndex !== -1 ? agentInput.substring(0, lastAtIndex) : agentInput;
      setAgentInput(`${base}[Ref: ${itemId}] `);
      setAgentReferenceId(itemId);
      setAgentReferenceUrl(itemUrl);
      setAgentReferences(prev => {
        if (prev.some(reference => reference.id === itemId)) return prev;
        return [...prev, { id: itemId, url: itemUrl }];
      });
    } else {
      const lastAtIndex = prompt.lastIndexOf("@");
      const base = lastAtIndex !== -1 ? prompt.substring(0, lastAtIndex) : prompt;
      setPrompt(`${base}[Ref: ${itemId}] `);
      setReferenceImage(itemUrl);
      setReferenceImages(prev => {
        if (prev.some(reference => reference.id === itemId)) return prev;
        const role =
          type === "video-prompt" && videoReferenceMode === "firstLast"
            ? prev.length === 1
              ? "end"
              : prev.length === 0
                ? "start"
                : "general"
            : "general";
        return [...prev, { id: itemId, url: itemUrl, role }];
      });
    }
    setAtDropdown({ visible: false, type, search: "" });
  };

  return {
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    atDropdown,
    handleImageUpload,
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
