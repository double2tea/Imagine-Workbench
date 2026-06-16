import { t } from "@/lib/i18n";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { IMAGE_REFERENCE_LIMIT } from "@/hooks/useReferenceState";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { compressReferenceImageFile } from "@/lib/reference-images";
import { toErrorMessage } from "@/lib/client-fetch-error";

type NoticeType = "error" | "info" | "success";

interface UseClipboardImageImportParams {
  agentReferenceCount: number;
  imageReferenceLimit: number;
  pushWorkspaceNotice: (type: NoticeType, message: string) => void;
  referenceImageCount: number;
  setAgentReferenceId: Dispatch<SetStateAction<string | null>>;
  setAgentReferenceUrl: Dispatch<SetStateAction<string | null>>;
  setAgentReferences: Dispatch<SetStateAction<ReferenceImageRef[]>>;
  setReferenceImage: Dispatch<SetStateAction<string | null>>;
  setReferenceImages: Dispatch<SetStateAction<ReferenceImageRef[]>>;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function readPastedImageFile(dataTransfer: DataTransfer): File | null {
  const imageItem = Array.from(dataTransfer.items).find(
    item => item.kind === "file" && item.type.startsWith("image/"),
  );
  return imageItem?.getAsFile() ?? null;
}

export function useClipboardImageImport({
  agentReferenceCount,
  imageReferenceLimit,
  pushWorkspaceNotice,
  referenceImageCount,
  setAgentReferenceId,
  setAgentReferenceUrl,
  setAgentReferences,
  setReferenceImage,
  setReferenceImages,
}: UseClipboardImageImportParams) {
  const agentReferenceCountRef = useRef(agentReferenceCount);
  const imageReferenceLimitRef = useRef(imageReferenceLimit);
  const referenceImageCountRef = useRef(referenceImageCount);

  useEffect(() => {
    agentReferenceCountRef.current = agentReferenceCount;
  }, [agentReferenceCount]);

  useEffect(() => {
    imageReferenceLimitRef.current = imageReferenceLimit;
  }, [imageReferenceLimit]);

  useEffect(() => {
    referenceImageCountRef.current = referenceImageCount;
  }, [referenceImageCount]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const file = readPastedImageFile(clipboardData);
      if (!file) return;

      const isAgentPaste = event.target instanceof Element && event.target.closest(".imagine-agent-dock") !== null;
      if (!isAgentPaste && document.querySelector(".board-canvas")) return;

      event.preventDefault();
      const currentReferenceCount = isAgentPaste ? agentReferenceCountRef.current : referenceImageCountRef.current;
      const referenceLimit = isAgentPaste ? IMAGE_REFERENCE_LIMIT : imageReferenceLimitRef.current;

      if (referenceLimit === 0) {
        pushWorkspaceNotice("error", t("common.notices.clipboardModelNotSupportRef"));
        return;
      }
      if (currentReferenceCount >= referenceLimit) {
        pushWorkspaceNotice("error", t("common.notices.clipboardRefLimitReached", { limit: referenceLimit }));
        return;
      }

      try {
        const compressedDataUrl = await compressReferenceImageFile(file);
        const latestReferenceCount = isAgentPaste ? agentReferenceCountRef.current : referenceImageCountRef.current;
        if (latestReferenceCount >= referenceLimit) {
          pushWorkspaceNotice("error", t("common.notices.clipboardRefLimitReached", { limit: referenceLimit }));
          return;
        }

        const newReferenceId = makeClientId(isAgentPaste ? "agent_paste" : "paste");
        const nextReferenceCount = latestReferenceCount + 1;

        if (isAgentPaste) {
          agentReferenceCountRef.current = nextReferenceCount;
          setAgentReferenceId(newReferenceId);
          setAgentReferenceUrl(compressedDataUrl);
          setAgentReferences(prev => {
            if (prev.some(reference => reference.id === newReferenceId)) return prev;
            return [...prev, { id: newReferenceId, url: compressedDataUrl }];
          });
          pushWorkspaceNotice("success", t("common.notices.clipboardImportedAgentRef", { current: nextReferenceCount, max: referenceLimit }));
          return;
        }

        referenceImageCountRef.current = nextReferenceCount;
        setReferenceImage(compressedDataUrl);
        setReferenceImages(prev => {
          if (prev.some(reference => reference.id === newReferenceId)) return prev;
          return [...prev, { id: newReferenceId, url: compressedDataUrl, role: "general" }];
        });
        pushWorkspaceNotice("success", t("common.notices.clipboardImportedRef", { current: nextReferenceCount, max: referenceLimit }));
      } catch (error) {
        console.error(error);
        pushWorkspaceNotice("error", toErrorMessage(error, t("common.notices.clipboardImageCompressFailed")));
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    agentReferenceCount,
    imageReferenceLimit,
    pushWorkspaceNotice,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
    setReferenceImage,
    setReferenceImages,
  ]);
}
