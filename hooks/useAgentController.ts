import { t, type Locale } from "@/lib/i18n";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getExecutableAction, getPendingAgentAction, type ChatMessage } from "@/components/agent/AgentDock";
import { API_ROUTES } from "@/lib/api/routes";
import type { AgentGenerationParams, AgentToolAction } from "@/lib/agent-actions";
import {
  isCustomImageResolutionValue,
  prepareAgentActionDraft,
  validateAgentToolAction,
} from "@/lib/agent-tool-action";
import type { AgentBoardContext, AgentSurface } from "@/lib/agent-context";
import type { CreationMode } from "@/components/creation/CreationModeTabs";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { StorageItem } from "@/lib/db";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { getSendableAgentMediaReferences } from "@/lib/agent-chat-model";
import type { AudioOperationMode } from "@/lib/providers/model-catalog";

interface UseAgentControllerParams {
  agentInput: string;
  agentReferenceId: string | null;
  agentReferences: ReferenceImageRef[];
  agentReferenceUrl: string | null;
  buildProviderHeaders: (target?: string) => Record<string, string>;
  chatStorageKey?: string;
  executeToolActionOverride?: (input: ExecuteToolActionOverrideInput) => Promise<ExecuteToolActionOverrideReturn> | ExecuteToolActionOverrideReturn;
  getBoardContext?: () => AgentBoardContext;
  generateManualAudio: (overrides?: GenerationOverrides) => Promise<boolean>;
  generateManualImage: (overrides?: GenerationOverrides) => Promise<boolean>;
  generateManualVideo: (overrides?: GenerationOverrides) => Promise<boolean>;
  handleSelectImageModel: (model: string) => void;
  handleSelectVideoModel: (model: string) => void;
  items: StorageItem[];
  launchMaskEditor: (imageUrl: string, id: string, destination?: "creative" | "agent") => void;
  locale: Locale;
  optimizeActivePrompt: (promptOverride?: string) => Promise<void>;
  selectedChatModel: string;
  surface?: AgentSurface;
  setAgentInput: Dispatch<SetStateAction<string>>;
  setAspectRatio: Dispatch<SetStateAction<string>>;
  setIsAgentDockOpen: Dispatch<SetStateAction<boolean>>;
  setPrompt: Dispatch<SetStateAction<string>>;
  setReferenceImage: Dispatch<SetStateAction<string | null>>;
  setReferenceImages: Dispatch<SetStateAction<ReferenceImageRef[]>>;
  setTraditionalSubTab: Dispatch<SetStateAction<CreationMode>>;
  onActionValidationError?: (message: string) => void;
}

function normalizeRestoredAgentMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant") return message;

  const executableAction = getExecutableAction(message);
  if (!executableAction) return message;

  const interactiveState = message.interactiveState ?? "completed";
  const actionDraft = message.actionDraft ?? prepareAgentActionDraft(executableAction);

  if (message.interactiveState === interactiveState && message.actionDraft === actionDraft) {
    return message;
  }

  return { ...message, interactiveState, actionDraft };
}

function normalizeRestoredAgentMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(normalizeRestoredAgentMessage);
}

interface GenerationOverrides {
  audioFormat?: string;
  audioMode?: AudioOperationMode;
  audioStylePrompt?: string;
  asrLanguage?: "auto" | "zh" | "en";
  imageQuality?: string;
  imageResolution?: string;
  isCustomImageResolution?: boolean;
  model?: string;
  prompt?: string;
  referenceImage?: string | null;
  referenceImages?: ReferenceImageRef[];
  size?: string;
  thinkingLevel?: string;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: "reference" | "firstLast";
  videoResolution?: string;
  voiceCloneConsentAccepted?: boolean;
  voiceProfileId?: string;
}

interface ExecuteToolActionOverrideInput {
  action: AgentToolAction;
  references: ReferenceImageRef[];
}

interface ExecuteToolActionOverrideResult {
  handled: boolean;
  success: boolean;
}

type ExecuteToolActionOverrideReturn = boolean | ExecuteToolActionOverrideResult;

interface AgentResponsePayload {
  activeSkills?: string[];
  boardAction?: ChatMessage["boardAction"];
  recommendedAction?: ChatMessage["recommendedAction"];
  suggestedFollowUps?: string[];
  text?: string;
  thought?: string;
  toolCalls?: ChatMessage["toolCalls"];
}

function canAutoExecuteAgentAction(action: AgentToolAction): boolean {
  return action.type === "optimize_prompt" ||
    action.type === "generate_image" ||
    action.type === "edit_image" ||
    action.type === "generate_video" ||
    action.type === "generate_audio";
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

async function resolveAgentReferenceOriginals(
  references: ReferenceImageRef[],
  items: StorageItem[],
): Promise<ReferenceImageRef[]> {
  return Promise.all(references.map(async reference => {
    const item = items.find(entry => entry.id === reference.id);
    if (!item || item.type === "transcript") return reference;
    const originalUrl = await resolveAssetOriginalUrl(item);
    if (!originalUrl.trim()) {
      throw new Error(t("common.notices.referenceMediaOriginalNotFound"));
    }
    return {
      ...reference,
      type: reference.type ?? item.type,
      url: originalUrl,
    };
  }));
}

function buildWelcomeMessage(): ChatMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: t("common.notices.agentWelcomeContent"),
    thought: t("common.notices.agentWelcomeThought"),
    suggestedFollowUps: [
      t("common.notices.agentFollowUp1"),
      t("common.notices.agentFollowUp2"),
      t("common.notices.agentFollowUp3"),
    ],
  };
}

export function useAgentController({
  agentInput,
  agentReferenceId,
  agentReferences,
  agentReferenceUrl,
  buildProviderHeaders,
  chatStorageKey = "imagine_agent_chat",
  executeToolActionOverride,
  getBoardContext,
  generateManualAudio,
  generateManualImage,
  generateManualVideo,
  handleSelectImageModel,
  handleSelectVideoModel,
  items,
  launchMaskEditor,
  locale,
  optimizeActivePrompt,
  selectedChatModel,
  surface = "workbench",
  setAgentInput,
  setAspectRatio,
  setIsAgentDockOpen,
  setPrompt,
  setReferenceImage,
  setReferenceImages,
  setTraditionalSubTab,
  onActionValidationError,
}: UseAgentControllerParams) {
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>(() => [buildWelcomeMessage()]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [activeCountdownId, setActiveCountdownId] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const autoCountdownInterval = useRef<NodeJS.Timeout | null>(null);
  const chatPersistTimer = useRef<NodeJS.Timeout | null>(null);
  const agentMessagesRef = useRef(agentMessages);

  useEffect(() => {
    agentMessagesRef.current = agentMessages;
  }, [agentMessages]);

  useEffect(() => {
    const restoreAgentState = window.setTimeout(() => {
      const storedChat = localStorage.getItem(chatStorageKey);
      if (!storedChat) {
        setAgentMessages([buildWelcomeMessage()]);
      } else {
        try {
          const parsed: unknown = JSON.parse(storedChat);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAgentMessages(normalizeRestoredAgentMessages(parsed as ChatMessage[]));
          } else {
            setAgentMessages([buildWelcomeMessage()]);
          }
        } catch {
          setAgentMessages([buildWelcomeMessage()]);
        }
      }

      const storedAutoExec = localStorage.getItem("imagine_auto_execute");
      if (storedAutoExec) setAutoExecute(storedAutoExec === "true");
    }, 0);

    return () => window.clearTimeout(restoreAgentState);
  }, [chatStorageKey]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages, isAgentLoading]);

  useEffect(() => {
    if (agentMessages.length > 1) {
      if (chatPersistTimer.current) clearTimeout(chatPersistTimer.current);
      const snapshot = agentMessages;
      chatPersistTimer.current = setTimeout(() => {
        try { localStorage.setItem(chatStorageKey, JSON.stringify(snapshot)); } catch { /* storage unavailable */ }
      }, 500);
    }
    return () => {
      if (chatPersistTimer.current) clearTimeout(chatPersistTimer.current);
    };
  }, [agentMessages, chatStorageKey]);

  const clearAutoCountdownInterval = () => {
    if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
    autoCountdownInterval.current = null;
  };

  const clearActiveCountdown = () => {
    clearAutoCountdownInterval();
    setActiveCountdownId(null);
    setCountdownSeconds(3);
  };

  useEffect(() => clearAutoCountdownInterval, []);

  const handleToggleAutoExecute = (value: boolean) => {
    setAutoExecute(value);
    try { localStorage.setItem("imagine_auto_execute", String(value)); } catch { /* storage unavailable */ }
    if (!value) {
      clearActiveCountdown();
    }
  };

  const getActiveAgentReferences = (): ReferenceImageRef[] => {
    if (agentReferences.length > 0) return agentReferences;
    if (agentReferenceId && agentReferenceUrl) return [{ id: agentReferenceId, url: agentReferenceUrl }];
    return [];
  };

  const getActionReferenceImages = (referenceImageId?: string): ReferenceImageRef[] => {
    const activeAgentReferences = getActiveAgentReferences();

    if (referenceImageId) {
      const agentReference = activeAgentReferences.find(reference => reference.id === referenceImageId);
      if (agentReference) return [agentReference];

      const matchedAsset = items.find(item => item.id === referenceImageId);
      if (matchedAsset && matchedAsset.type !== "transcript") {
        return [{ id: matchedAsset.id, type: matchedAsset.type, url: matchedAsset.url, role: "general" }];
      }
    }

    return activeAgentReferences;
  };

  const bridgeActionReferences = (references: ReferenceImageRef[]) => {
    if (references.length === 0) return;
    setReferenceImage(references[0]?.url ?? null);
    setReferenceImages(references);
  };

  const executeAgentToolAction = async (messageId: string, action: AgentToolAction) => {
    const { type, params = {} } = action as AgentToolAction & { params: AgentGenerationParams };
    const actionReferences = getActionReferenceImages(params.referenceImageId);
    const validationError = validateAgentToolAction(action, {
      hasEditReference: type !== "edit_image" || actionReferences.length > 0,
      references: actionReferences,
    });
    if (validationError) {
      onActionValidationError?.(validationError);
      return;
    }

    clearActiveCountdown();
    setAgentMessages(prev => prev.map(message => message.id === messageId ? { ...message, interactiveState: "executing" } : message));
    const actionReferenceOverride: GenerationOverrides | undefined = actionReferences.length > 0
      ? { referenceImage: actionReferences[0]?.url ?? null, referenceImages: actionReferences }
      : undefined;
    if (executeToolActionOverride) {
      const result = await executeToolActionOverride({ action, references: actionReferences });
      const wasHandled = typeof result === "boolean" ? result : result.handled;
      const didSucceed = typeof result === "boolean" ? result : result.success;
      if (wasHandled) {
        setAgentMessages(prev => prev.map(message => message.id === messageId ? { ...message, interactiveState: didSucceed ? "completed" : "idle" } : message));
        return;
      }
    }

    if (type === "optimize_prompt") {
      setPrompt(params.prompt || "");
      bridgeActionReferences(actionReferences);
      optimizeActivePrompt(params.prompt || "");
    } else if (type === "generate_image") {
      setPrompt(params.prompt || "");
      bridgeActionReferences(actionReferences);
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.model) handleSelectImageModel(params.model);
      setTraditionalSubTab("image");

      setTimeout(() => {
        generateManualImage({
          ...actionReferenceOverride,
          model: params.model,
          prompt: params.prompt || "",
          size: params.aspectRatio,
          imageResolution: params.imageResolution,
          imageQuality: params.imageQuality,
          thinkingLevel: params.thinkingLevel,
          isCustomImageResolution: isCustomImageResolutionValue(params.imageResolution),
        });
      }, 500);
    } else if (type === "generate_video") {
      setPrompt(params.prompt || "");
      if (params.aspectRatio) setAspectRatio(params.aspectRatio);
      if (params.model) handleSelectVideoModel(params.model);
      bridgeActionReferences(actionReferences);

      setTraditionalSubTab("video");
      setTimeout(() => {
        generateManualVideo({
          ...actionReferenceOverride,
          model: params.model,
          prompt: params.prompt || "",
          size: params.aspectRatio,
          videoResolution: params.videoResolution,
          videoDuration: params.videoDuration,
          videoPreset: params.videoPreset,
          videoReferenceMode: params.videoReferenceMode,
        });
      }, 500);
    } else if (type === "generate_audio") {
      setPrompt(params.prompt || "");
      bridgeActionReferences(actionReferences);
      setTraditionalSubTab("audio");
      setTimeout(() => {
        void (async () => {
          const didStart = await generateManualAudio({
            ...actionReferenceOverride,
            audioFormat: params.audioFormat,
            audioMode: params.audioMode,
            audioStylePrompt: params.audioStylePrompt,
            asrLanguage: params.asrLanguage,
            model: params.model,
            prompt: params.prompt || "",
            voiceCloneConsentAccepted: params.voiceCloneConsentAccepted,
            voiceProfileId: params.voiceProfileId,
          });
          setAgentMessages(prev => prev.map(message => message.id === messageId ? { ...message, interactiveState: didStart ? "completed" : "idle" } : message));
        })();
      }, 500);
      return;
    } else if (type === "edit_image") {
      setPrompt(params.prompt || "");
      setTraditionalSubTab("image");
      bridgeActionReferences(actionReferences);
      const editReference = actionReferences[0];
      if (editReference) {
        launchMaskEditor(editReference.url, editReference.id);
      }
    }
    setAgentMessages(prev => prev.map(message => message.id === messageId ? { ...message, interactiveState: "completed" } : message));
  };

  const startAutoCountdown = (messageId: string, action: AgentToolAction) => {
    clearActiveCountdown();
    setActiveCountdownId(messageId);
    let secondsLeft = 3;
    setCountdownSeconds(secondsLeft);

    autoCountdownInterval.current = setInterval(() => {
      secondsLeft -= 1;
      setCountdownSeconds(secondsLeft);
      if (secondsLeft <= 0) {
        clearAutoCountdownInterval();
        const message = agentMessagesRef.current.find(entry => entry.id === messageId);
        const pendingAction = message ? getPendingAgentAction(message) : action;
        if (pendingAction) executeAgentToolAction(messageId, pendingAction);
      }
    }, 1000);
  };

  const submitAgentPrompt = async (forcedPrompt?: string, forcedReferences?: ReferenceImageRef[]) => {
    const activeText = (forcedPrompt || agentInput).trim();
    if (!activeText) return;

    clearActiveCountdown();
    setIsAgentDockOpen(true);

    const userMessage: ChatMessage = {
      id: makeClientId("usr"),
      role: "user",
      content: activeText,
    };

    setAgentMessages(prev => [...prev, userMessage]);
    setAgentInput("");
    setIsAgentLoading(true);

    try {
      const gallerySummary = items.map(item => ({
        id: item.id,
        type: item.type,
        prompt: item.prompt,
        aspectRatio: item.aspectRatio,
      }));

      const activeAgentReferences = forcedReferences ??
        (agentReferences.length > 0
          ? agentReferences
          : agentReferenceId && agentReferenceUrl
            ? [{ id: agentReferenceId, url: agentReferenceUrl }]
            : []);
      const originalAgentReferences = await resolveAgentReferenceOriginals(activeAgentReferences, items);
      const sendableAgentReferences = getSendableAgentMediaReferences(
        originalAgentReferences,
        agentReferenceId,
        originalAgentReferences[0]?.url ?? agentReferenceUrl,
      );
      const headers = buildProviderHeaders(selectedChatModel);

      const requestHistory = agentMessages
        .concat(userMessage)
        .slice(-10)
        .map(message => ({
          role: message.role,
          content: message.content,
        }));

      const response = await fetch(API_ROUTES.agent.respond, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          messages: requestHistory,
          surface,
          boardContext: getBoardContext?.(),
          gallerySummary,
          agentReferences: sendableAgentReferences.map(reference => ({
            id: reference.id,
            type: reference.type,
            url: reference.url,
          })),
          agentReferenceId: sendableAgentReferences[0]?.id || undefined,
          locale,
          model: selectedChatModel,
        }),
      });

      if (response.ok) {
        const agentResponse = await response.json() as AgentResponsePayload;
        const assistantMsgId = makeClientId("asst");
        const recommendedAction = agentResponse.recommendedAction || { type: "none" as const };
        const boardAction = agentResponse.boardAction || { type: "none" as const };
        const executableAction = boardAction.type !== "none" ? boardAction : recommendedAction;
        const actionDraft = executableAction.type !== "none"
          ? prepareAgentActionDraft(executableAction)
          : undefined;

        const assistantMessage: ChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content: agentResponse.text || t("common.notices.agentReceivedInstruction"),
          thought: agentResponse.thought || t("common.notices.agentAnalysisThought"),
          recommendedAction,
          boardAction,
          actionDraft,
          suggestedFollowUps: agentResponse.suggestedFollowUps || [],
          interactiveState: "idle",
          activeSkills: agentResponse.activeSkills || [],
          toolCalls: agentResponse.toolCalls || [],
        };

        setAgentMessages(prev => [...prev, assistantMessage]);

        if (autoExecute && actionDraft && canAutoExecuteAgentAction(actionDraft)) {
          startAutoCountdown(assistantMsgId, actionDraft);
        }
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("common.notices.agentRequestOverloaded");
      setAgentMessages(prev => [...prev, {
        id: makeClientId("asst_err"),
        role: "assistant",
        content: t("common.notices.agentNetworkError", { message }),
        suggestedFollowUps: [t("common.notices.agentRetryFollowUp1"), t("common.notices.agentRetryFollowUp2")],
      }]);
    } finally {
      setIsAgentLoading(false);
    }
  };

  const updateAgentActionDraft = (messageId: string, action: AgentToolAction) => {
    setAgentMessages(prev => prev.map(message => (
      message.id === messageId ? { ...message, actionDraft: action } : message
    )));
  };

  const declineAgentToolAction = (messageId: string) => {
    clearActiveCountdown();
    setAgentMessages(prev => prev.map(message => message.id === messageId ? { ...message, interactiveState: "declined" } : message));
  };

  const handleClearChat = () => {
    setAgentMessages([buildWelcomeMessage()]);
    try { localStorage.removeItem(chatStorageKey); } catch { /* storage unavailable */ }
  };

  return {
    activeCountdownId,
    agentMessages,
    autoExecute,
    chatBottomRef,
    clearActiveCountdown,
    countdownSeconds,
    declineAgentToolAction,
    executeAgentToolAction,
    handleClearChat,
    handleToggleAutoExecute,
    isAgentLoading,
    submitAgentPrompt,
    updateAgentActionDraft,
  };
}
