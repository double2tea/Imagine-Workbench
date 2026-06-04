import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { IMAGE_REFERENCE_LIMIT } from "@/hooks/useReferenceState";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { compressReferenceImageFile } from "@/lib/reference-images";

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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
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

      event.preventDefault();
      const isAgentPaste = event.target instanceof Element && event.target.closest(".imagine-agent-dock") !== null;
      const currentReferenceCount = isAgentPaste ? agentReferenceCountRef.current : referenceImageCountRef.current;
      const referenceLimit = isAgentPaste ? IMAGE_REFERENCE_LIMIT : imageReferenceLimitRef.current;

      if (referenceLimit === 0) {
        pushWorkspaceNotice("error", "当前图片模型不支持参考图");
        return;
      }
      if (currentReferenceCount >= referenceLimit) {
        pushWorkspaceNotice("error", `参考图已达上限：最多 ${referenceLimit} 张，先移除一张再粘贴`);
        return;
      }

      try {
        const compressedDataUrl = await compressReferenceImageFile(file);
        const latestReferenceCount = isAgentPaste ? agentReferenceCountRef.current : referenceImageCountRef.current;
        if (latestReferenceCount >= referenceLimit) {
          pushWorkspaceNotice("error", `参考图已达上限：最多 ${referenceLimit} 张，先移除一张再粘贴`);
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
          pushWorkspaceNotice("success", `已从剪贴板导入 Agent 参考图（${nextReferenceCount}/${referenceLimit}）`);
          return;
        }

        referenceImageCountRef.current = nextReferenceCount;
        setReferenceImage(compressedDataUrl);
        setReferenceImages(prev => {
          if (prev.some(reference => reference.id === newReferenceId)) return prev;
          return [...prev, { id: newReferenceId, url: compressedDataUrl, role: "general" }];
        });
        pushWorkspaceNotice("success", `已从剪贴板导入参考图（${nextReferenceCount}/${referenceLimit}）`);
      } catch (error) {
        console.error(error);
        pushWorkspaceNotice("error", toErrorMessage(error, "剪贴板图片压缩失败，请重新复制图片后再试"));
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
