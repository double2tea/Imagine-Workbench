import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { IMAGE_REFERENCE_LIMIT } from "@/hooks/useReferenceState";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";

type NoticeType = "error" | "info" | "success";

interface UseClipboardImageImportParams {
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read clipboard image as data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read clipboard image"));
    reader.readAsDataURL(file);
  });
}

export function useClipboardImageImport({
  pushWorkspaceNotice,
  referenceImageCount,
  setAgentReferenceId,
  setAgentReferenceUrl,
  setAgentReferences,
  setReferenceImage,
  setReferenceImages,
}: UseClipboardImageImportParams) {
  const referenceImageCountRef = useRef(referenceImageCount);

  useEffect(() => {
    referenceImageCountRef.current = referenceImageCount;
  }, [referenceImageCount]);

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const file = readPastedImageFile(clipboardData);
      if (!file) return;

      event.preventDefault();
      if (referenceImageCountRef.current >= IMAGE_REFERENCE_LIMIT) {
        pushWorkspaceNotice("error", `参考图已达上限：最多 ${IMAGE_REFERENCE_LIMIT} 张，先移除一张再粘贴`);
        return;
      }

      try {
        const base64 = await readFileAsDataUrl(file);
        if (referenceImageCountRef.current >= IMAGE_REFERENCE_LIMIT) {
          pushWorkspaceNotice("error", `参考图已达上限：最多 ${IMAGE_REFERENCE_LIMIT} 张，先移除一张再粘贴`);
          return;
        }

        const newReferenceId = makeClientId("paste");
        const nextReferenceImageCount = referenceImageCountRef.current + 1;
        referenceImageCountRef.current = nextReferenceImageCount;

        setReferenceImage(base64);
        setAgentReferenceId(newReferenceId);
        setAgentReferenceUrl(base64);
        setReferenceImages(prev => {
          if (prev.some(reference => reference.id === newReferenceId)) return prev;
          if (prev.length >= IMAGE_REFERENCE_LIMIT) return prev;
          return [...prev, { id: newReferenceId, url: base64, role: "general" }];
        });
        setAgentReferences(prev => {
          if (prev.some(reference => reference.id === newReferenceId)) return prev;
          return [...prev, { id: newReferenceId, url: base64 }];
        });
        pushWorkspaceNotice("success", `已从剪贴板导入参考图（${nextReferenceImageCount}/${IMAGE_REFERENCE_LIMIT}）`);
      } catch (error) {
        console.error(error);
        pushWorkspaceNotice("error", "剪贴板图片读取失败，请重新复制图片后再试");
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [
    pushWorkspaceNotice,
    setAgentReferenceId,
    setAgentReferenceUrl,
    setAgentReferences,
    setReferenceImage,
    setReferenceImages,
  ]);
}
