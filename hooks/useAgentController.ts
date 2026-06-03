import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getExecutableAction, getPendingAgentAction, type AgentToolAction, type ChatMessage } from "@/components/agent/AgentDock";
import {
  isCustomImageResolutionValue,
  prepareAgentActionDraft,
  validateAgentToolAction,
  type AgentGenerationParams,
} from "@/lib/agent-tool-action";
import type { AgentBoardContext, AgentSurface } from "@/lib/agent-context";
import type { CreationMode } from "@/components/creation/CreationModeTabs";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { StorageItem } from "@/lib/db";
import { getSendableAgentImageReferences } from "@/lib/agent-chat-model";

type NoticeType = "error" | "info" | "success";

interface UseAgentControllerParams {
  agentInput: string;
  agentReferenceId: string | null;
  agentReferences: ReferenceImageRef[];
  agentReferenceUrl: string | null;
  buildProviderHeaders: (target?: string) => Record<string, string>;
  chatStorageKey?: string;
  executeToolActionOverride?: (input: ExecuteToolActionOverrideInput) => Promise<boolean> | boolean;
  getBoardContext?: () => AgentBoardContext;
  generateManualImage: (overrides?: GenerationOverrides) => Promise<boolean>;
  generateManualVideo: (overrides?: GenerationOverrides) => Promise<boolean>;
  handleSelectImageModel: (model: string) => void;
  handleSelectVideoModel: (model: string) => void;
  items: StorageItem[];
  launchMaskEditor: (imageUrl: string, id: string, destination?: "creative" | "agent") => void;
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
  videoResolution?: string;
}

interface ExecuteToolActionOverrideInput {
  action: AgentToolAction;
  references: ReferenceImageRef[];
}

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
    action.type === "generate_video";
}

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "您好！我是您的智能创意助手。您可以一边调整左侧创作参数，一边随时交办高阶创意任务。例如：「帮我做一套3张赛博朋克风战士的相册」或「帮我把上一部图片转成16:9的微短视频」。我会给出建议，并在确认后填入参数或执行生成。",
  thought: "初始化底部 Agent Dock，准备读取画廊资产上下文...",
  suggestedFollowUps: [
    "优化并生成一张赛博朋克飞艇",
    "我想做一段太空科幻题材视频",
    "根据当前画廊给我三个延展方向",
  ],
};

export function useAgentController({
  agentInput,
  agentReferenceId,
  agentReferences,
  agentReferenceUrl,
  buildProviderHeaders,
  chatStorageKey = "imagine_agent_chat",
  executeToolActionOverride,
  getBoardContext,
  generateManualImage,
  generateManualVideo,
  handleSelectImageModel,
  handleSelectVideoModel,
  items,
  launchMaskEditor,
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
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [activeCountdownId, setActiveCountdownId] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const autoCountdownInterval = useRef<NodeJS.Timeout | null>(null);
  const agentMessagesRef = useRef(agentMessages);

  useEffect(() => {
    agentMessagesRef.current = agentMessages;
  }, [agentMessages]);

  useEffect(() => {
    const restoreAgentState = window.setTimeout(() => {
      const storedChat = localStorage.getItem(chatStorageKey);
      if (!storedChat) {
        setAgentMessages([WELCOME_MESSAGE]);
      } else {
        try {
          const parsed: unknown = JSON.parse(storedChat);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAgentMessages(normalizeRestoredAgentMessages(parsed as ChatMessage[]));
          } else {
            setAgentMessages([WELCOME_MESSAGE]);
          }
        } catch {
          setAgentMessages([WELCOME_MESSAGE]);
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
      localStorage.setItem(chatStorageKey, JSON.stringify(agentMessages));
    }
  }, [agentMessages, chatStorageKey]);

  const clearActiveCountdown = () => {
    if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
    setActiveCountdownId(null);
    setCountdownSeconds(3);
  };

  const handleToggleAutoExecute = (value: boolean) => {
    setAutoExecute(value);
    localStorage.setItem("imagine_auto_execute", String(value));
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
      if (matchedAsset) return [{ id: matchedAsset.id, url: matchedAsset.url, role: "general" }];
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
    });
    if (validationError) {
      onActionValidationError?.(validationError);
      return;
    }

    clearActiveCountdown();
    setAgentMessages(prev => prev.map(message => message.id === messageId ? { ...message, interactiveState: "completed" } : message));
    const actionReferenceOverride: GenerationOverrides | undefined = actionReferences.length > 0
      ? { referenceImage: actionReferences[0]?.url ?? null, referenceImages: actionReferences }
      : undefined;
    if (executeToolActionOverride) {
      const wasHandled = await executeToolActionOverride({ action, references: actionReferences });
      if (wasHandled) return;
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
        });
      }, 500);
    } else if (type === "edit_image") {
      setPrompt(params.prompt || "");
      setTraditionalSubTab("image");
      bridgeActionReferences(actionReferences);
      const editReference = actionReferences[0];
      if (editReference) {
        launchMaskEditor(editReference.url, editReference.id);
      }
    }
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
        if (autoCountdownInterval.current) clearInterval(autoCountdownInterval.current);
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
      const sendableAgentReferences = getSendableAgentImageReferences(
        activeAgentReferences,
        agentReferenceId,
        agentReferenceUrl,
      );
      const headers = buildProviderHeaders(selectedChatModel);

      const requestHistory = agentMessages
        .concat(userMessage)
        .slice(-10)
        .map(message => ({
          role: message.role,
          content: message.content,
        }));

      const response = await fetch("/api/gemini/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          messages: requestHistory,
          surface,
          boardContext: getBoardContext?.(),
          gallerySummary,
          agentReferences: sendableAgentReferences.map(reference => ({ id: reference.id, url: reference.url })),
          agentReferenceId: sendableAgentReferences[0]?.id || undefined,
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
          content: agentResponse.text || "我已收到指令，该项目可以怎么推进？",
          thought: agentResponse.thought || "分析场景，规划后续设计合成步骤...",
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
      const message = error instanceof Error ? error.message : "请求过载";
      setAgentMessages(prev => [...prev, {
        id: makeClientId("asst_err"),
        role: "assistant",
        content: `抱歉，Agent 在网络调谐时出现异常 (${message}). 请检查网络、API Key 或重试。`,
        suggestedFollowUps: ["重试我先前的请求", "根据当前参数重新规划"],
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
    setAgentMessages([WELCOME_MESSAGE]);
    localStorage.removeItem(chatStorageKey);
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
