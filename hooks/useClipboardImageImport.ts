import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";

interface UseClipboardImageImportParams {
  setAgentReferenceId: Dispatch<SetStateAction<string | null>>;
  setAgentReferenceUrl: Dispatch<SetStateAction<string | null>>;
  setAgentReferences: Dispatch<SetStateAction<ReferenceImageRef[]>>;
  setReferenceImage: Dispatch<SetStateAction<string | null>>;
  setReferenceImages: Dispatch<SetStateAction<ReferenceImageRef[]>>;
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

export function useClipboardImageImport({
  setAgentReferenceId,
  setAgentReferenceUrl,
  setAgentReferences,
  setReferenceImage,
  setReferenceImages,
}: UseClipboardImageImportParams) {
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const clipboardItems = event.clipboardData?.items;
      if (!clipboardItems) return;
      for (const item of clipboardItems) {
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
              const base64 = readerEvent.target?.result as string;
              const newReferenceId = makeClientId("import");

              setReferenceImage(base64);
              setAgentReferenceId(newReferenceId);
              setAgentReferenceUrl(base64);
              setReferenceImages(prev => {
                if (prev.some(reference => reference.id === newReferenceId)) return prev;
                return [...prev, { id: newReferenceId, url: base64, role: "general" }];
              });
              setAgentReferences(prev => {
                if (prev.some(reference => reference.id === newReferenceId)) return prev;
                return [...prev, { id: newReferenceId, url: base64 }];
              });
              alert("📋 识别到剪贴板图像！已作为参考图导入。");
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [setAgentReferenceId, setAgentReferenceUrl, setAgentReferences, setReferenceImage, setReferenceImages]);
}
