import { createContext, useContext } from "react";
import type { StorageItem } from "@/lib/db";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import type { BoardGenerateNodeUpdate, BoardReferenceRole, BoardRunningHubAppNodeUpdate, BoardRunningHubAppSchemaResult } from "@/lib/board/types";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import type { CapturedVideoFrame } from "@/lib/video-frame";

export interface BoardNodeCallbacks {
  onDelete: (nodeId: string) => void;
  onCancelGenerate: (nodeId: string) => void;
  onOpenAssetCompare?: (nodeId: string) => void;
  onDownloadAsset: (item: StorageItem) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onOpenPanorama: (item: StorageItem) => void;
  onSaveVoiceProfile: (item: StorageItem) => void;
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onEditAssetImage: (nodeId: string) => void;
  onImageQuickEdit: (nodeId: string, operation: ImageEditFeature) => void;
  onExecuteGenerate: (nodeId: string) => void;
  onFetchRunningHubAppSchema: (webappId: string) => Promise<BoardRunningHubAppSchemaResult>;
  onFocusReferenceSource: (nodeId: string) => void;
  onMoveReferenceGroupItem: (nodeId: string, assetId: string, direction: "up" | "down") => void;
  onMoveGenerateReferenceEdge: (nodeId: string, sourceEdgeId: string, targetEdgeId: string) => void;
  onMaterializeGenerateResult: (nodeId: string, assetId: string) => void;
  onRemoveGenerateReferenceEdge: (edgeId: string) => void;
  onRemoveReferenceGroupItem: (nodeId: string, assetId: string) => void;
  onSendAgent: (nodeId: string) => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSelectPromptReference: (nodeId: string, reference: BoardPromptReference) => void;
  onSelectAssetStackResult: (nodeId: string, assetId: string) => void;
  onSelectGenerateResult: (nodeId: string, assetId: string) => void;
  onUpdateReferenceGroupItemRole: (nodeId: string, assetId: string, role: BoardReferenceRole) => void;
  onUpdateAgent: (nodeId: string, instruction: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  onMeasureAssetAspectRatio: (nodeId: string, aspectRatio: number) => void;
  onUpdateNodeTitle: (nodeId: string, title: string) => void;
  onUpdateRunningHubApp: (nodeId: string, input: BoardRunningHubAppNodeUpdate) => void;
  onUpdateNote: (nodeId: string, body: string) => void;
  onUpdatePrompt: (nodeId: string, prompt: string) => void;
}

export const BoardNodeCallbacksContext = createContext<BoardNodeCallbacks | null>(null);

export function useBoardNodeCallbacks(): BoardNodeCallbacks {
  const ctx = useContext(BoardNodeCallbacksContext);
  if (!ctx) throw new Error("useBoardNodeCallbacks must be used within BoardWorkspace");
  return ctx;
}
