import type { ChangeEvent, CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, MutableRefObject, ReactNode, Ref } from "react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, FileAudio, ImagePlus, Paintbrush, RefreshCw, Send, X } from "lucide-react";
import { motion } from "motion/react";
import PreviewImage from "@/components/PreviewImage";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import {
  type AgentReferenceInputSupport,
  formatAgentReferenceHint,
  getSendableAgentMediaReferences,
} from "@/lib/agent-chat-model";
import { AgentModelSelect } from "@/components/agent/AgentModelSelect";
import { AgentActionSummary } from "@/components/agent/AgentActionSummary";
import { AgentPendingActionEditor } from "@/components/agent/AgentPendingActionEditor";
import type { AgentBoardAction, AgentToolAction, AgentWorkbenchAction } from "@/lib/agent-actions";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";
import { getMediaReferenceType, mediaReferenceLabel, type MediaReferenceType } from "@/lib/media-references";
import { applyThemeClassesToDom, resolveThemeMode } from "@/lib/theme-mode";
import { gsap, prefersReducedWorkbenchMotion, useGSAP, WORKBENCH_GSAP_EASE } from "@/lib/workbench-gsap";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thought?: string;
  recommendedAction?: AgentWorkbenchAction;
  boardAction?: AgentBoardAction;
  actionDraft?: AgentToolAction;
  suggestedFollowUps?: string[];
  interactiveState?: "idle" | "executing" | "completed" | "declined";
  activeSkills?: string[];
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

export type { AgentBoardAction, AgentToolAction, AgentWorkbenchAction };

interface AgentModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

interface AgentDockProps {
  activeCountdownId: string | null;
  agentReferenceId: string | null;
  agentReferences: ReferenceImageRef[];
  agentReferenceUrl: string | null;
  atDropdownNode: ReactNode;
  audioModelGroups: AgentModelGroup[];
  autoExecute: boolean;
  chatBottomRef: Ref<HTMLDivElement>;
  chatModelGroups: AgentModelGroup[];
  countdownSeconds: number;
  imageModelGroups: AgentModelGroup[];
  input: string;
  isLoading: boolean;
  isOpen: boolean;
  messages: ChatMessage[];
  selectedChatModel: string;

  videoModelGroups: AgentModelGroup[];
  onSelectChatModel: (value: string) => void;
  onCancelCountdown: () => void;
  onChangeInput: (value: string) => void;
  onClearChat: () => void;
  onClearReference: () => void;
  onDeclineAction: (messageId: string) => void;
  onExecuteAction: (messageId: string, action: AgentToolAction) => void;
  onUpdateActionDraft: (messageId: string, action: AgentToolAction) => void;
  onMaskReference: () => void;
  onSubmit: () => void;
  onSuggestedPrompt: (prompt: string) => void;
  onToggleAutoExecute: (value: boolean) => void;
  onToggleOpen: () => void;
  onUploadReference: (event: ChangeEvent<HTMLInputElement>) => void;
}

interface AgentContentLine {
  kind: "paragraph" | "ordered" | "bullet";
  marker?: string;
  text: string;
}

interface AgentOrbPosition {
  x: number;
  y: number;
}

interface AgentOrbDragState {
  current: AgentOrbPosition;
  moved: boolean;
  origin: AgentOrbPosition;
  pointerId: number;
  startX: number;
  startY: number;
}

function clampAgentOrbPosition(position: AgentOrbPosition): AgentOrbPosition {
  const maxX = Math.max(AGENT_ORB_MARGIN, window.innerWidth - AGENT_ORB_SIZE - AGENT_ORB_MARGIN);
  const maxY = Math.max(AGENT_ORB_MARGIN, window.innerHeight - AGENT_ORB_SIZE - AGENT_ORB_MARGIN);
  return {
    x: Math.min(Math.max(position.x, AGENT_ORB_MARGIN), maxX),
    y: Math.min(Math.max(position.y, AGENT_ORB_MARGIN), maxY),
  };
}

function getDefaultAgentOrbPosition(): AgentOrbPosition {
  return clampAgentOrbPosition({
    x: window.innerWidth - AGENT_ORB_SIZE - 48,
    y: window.innerHeight - AGENT_ORB_SIZE - 56,
  });
}

function parseStoredAgentOrbPosition(value: string | null): AgentOrbPosition | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "x" in parsed &&
      "y" in parsed &&
      typeof parsed.x === "number" &&
      typeof parsed.y === "number"
    ) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    localStorage.removeItem(AGENT_ORB_POSITION_STORAGE_KEY);
  }
  return null;
}

function persistAgentOrbPosition(position: AgentOrbPosition) {
  localStorage.setItem(AGENT_ORB_POSITION_STORAGE_KEY, JSON.stringify(position));
}

function getInitialAgentOrbPosition(): AgentOrbPosition | null {
  if (typeof window === "undefined") return null;
  const storedPosition = parseStoredAgentOrbPosition(localStorage.getItem(AGENT_ORB_POSITION_STORAGE_KEY));
  return storedPosition ? clampAgentOrbPosition(storedPosition) : getDefaultAgentOrbPosition();
}

const TOOL_LABELS: Record<string, string> = {
  query_models: "查询模型",
  get_agent_capabilities: "查询能力",
  get_skill_info: "查询技能",
  get_gallery_assets: "搜索资产",
  get_prompt_blueprint: "获取模板",
  get_prompt_templates: "查询模板库",
  get_board_context: "读取画板",
  get_connected_context: "读取连接",
};

type AgentSkillTone = "accent" | "cyan" | "danger" | "fuchsia" | "lime" | "orange" | "success" | "teal" | "violet" | "warning";

const SKILL_LABELS: Record<string, { label: string; tone: AgentSkillTone }> = {
  Screenwriter: { label: "剧本写作", tone: "orange" },
  ScriptAnalyzer: { label: "剧本分析", tone: "cyan" },
  ShotBreakdownPlanner: { label: "分镜拆解", tone: "violet" },
  StoryboardBoardComposer: { label: "分镜画板", tone: "fuchsia" },
  BatchGenerationPlanner: { label: "批量规划", tone: "success" },
  PromptEngineer: { label: "提示词工程", tone: "teal" },
  PromptTemplateLibrarian: { label: "模板库", tone: "lime" },
  BoardContextRetriever: { label: "画板上下文", tone: "accent" },
  BoardComposer: { label: "画板编排", tone: "fuchsia" },
  ImageGenerator: { label: "智能生图", tone: "danger" },
  VideoGenerator: { label: "视频合成", tone: "violet" },
  ImageEditor: { label: "局部重绘", tone: "warning" },
  CreativePlanner: { label: "创意规划", tone: "violet" },
  SessionHistoryRetriever: { label: "历史回退", tone: "accent" },
  VariationSuggester: { label: "变体推荐", tone: "success" },
  AsyncTaskManager: { label: "后台跟踪", tone: "cyan" },
  ProjectSummarizer: { label: "资产汇总", tone: "violet" },
  ExportManager: { label: "批量导出", tone: "danger" },
};

const AGENT_ORB_POSITION_STORAGE_KEY = "imagine_agent_orb_position";
const AGENT_ORB_SIZE = 108;
const AGENT_ORB_MARGIN = 12;
const AGENT_ORB_DRAG_THRESHOLD = 4;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

const ACTION_LABELS: Record<AgentToolAction["type"], string> = {
  none: "无操作",
  optimize_prompt: "优化提示词",
  generate_image: "生成图片",
  edit_image: "编辑图片",
  generate_video: "生成视频",
  generate_audio: "生成音频",
  create_board_image_flow: "创建图片节点流程",
  create_board_video_flow: "创建视频节点流程",
  create_board_audio_flow: "创建音频节点流程",
  create_board_note: "创建画板笔记",
  update_board_node: "更新画板节点",
  apply_board_patch: "应用画板补丁",
  continue_image_to_video: "从图片续接视频",
};

export function getExecutableAction(message: ChatMessage): AgentToolAction | null {
  if (message.boardAction && message.boardAction.type !== "none") return message.boardAction;
  if (message.recommendedAction && message.recommendedAction.type !== "none") return message.recommendedAction;
  return null;
}

export function getPendingAgentAction(message: ChatMessage): AgentToolAction | null {
  if (message.actionDraft && message.actionDraft.type !== "none") return message.actionDraft;
  return getExecutableAction(message);
}

function parseAgentContent(content: string): AgentContentLine[] {
  const normalized = content
    .replace(/\s+(\d+\.\s+)/g, "\n$1")
    .replace(/\s+([-•]\s+)/g, "\n$1");

  return normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const ordered = line.match(/^(\d+)\.\s+(.*)$/);
      if (ordered) return { kind: "ordered", marker: ordered[1], text: ordered[2].trim() };

      const bullet = line.match(/^[-•]\s+(.*)$/);
      if (bullet) return { kind: "bullet", text: bullet[1].trim() };

      return { kind: "paragraph", text: line };
    });
}

function renderInlineEmphasis(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={`${part}-${index}`} className="imagine-agent-emphasis">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
}

function renderAgentReferencePreview(type: MediaReferenceType, url: string): ReactNode {
  if (type === "image") {
    return <PreviewImage src={url} alt="agent ref" className="h-full w-full object-cover" />;
  }
  if (type === "video") {
    return <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--iw-panel-soft)]">
      <FileAudio className="imagine-tone-icon h-5 w-5" data-tone="violet" />
    </div>
  );
}

function renderAgentContent(content: string): ReactNode {
  const lines = parseAgentContent(content);

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        if (line.kind === "paragraph") {
          return (
            <p key={`${line.kind}-${index}`} className="leading-relaxed">
              {renderInlineEmphasis(line.text)}
            </p>
          );
        }

        return (
          <div key={`${line.kind}-${index}`} className="grid grid-cols-[auto_1fr] gap-2 leading-relaxed">
            <span className="imagine-tone-chip mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md border px-1.5 text-[10px] font-semibold" data-tone="accent">
              {line.marker ?? "•"}
            </span>
            <span>{renderInlineEmphasis(line.text)}</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentMessage({
  activeCountdownId,
  countdownSeconds,
  message,
  onCancelCountdown,
  audioModelGroups,
  imageModelGroups,
  videoModelGroups,
  onDeclineAction,
  onExecuteAction,
  onUpdateActionDraft,
  onSuggestedPrompt,
}: {
  activeCountdownId: string | null;
  audioModelGroups: AgentModelGroup[];
  countdownSeconds: number;
  imageModelGroups: AgentModelGroup[];
  videoModelGroups: AgentModelGroup[];
  message: ChatMessage;
  onCancelCountdown: () => void;
  onDeclineAction: (messageId: string) => void;
  onExecuteAction: (messageId: string, action: AgentToolAction) => void;
  onUpdateActionDraft: (messageId: string, action: AgentToolAction) => void;
  onSuggestedPrompt: (prompt: string) => void;
}) {
  const executableAction = getExecutableAction(message);
  const pendingAction = getPendingAgentAction(message);
  const canEditAction = message.interactiveState === "idle";

  return (
    <div className={`flex flex-col gap-1.5 ${message.role === "user" ? "self-end ml-10" : "self-start mr-10"}`}>
      <span className={`imagine-agent-role-label ${
        message.role === "user" ? "text-right text-[var(--iw-faint)]" : "imagine-tone-icon text-left"
      }`} data-tone={message.role === "assistant" ? "violet" : undefined}>
        {message.role === "user" ? "你" : "Agent"}
      </span>

      {message.role === "assistant" && message.activeSkills && message.activeSkills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-0.5 shadow-sm">
          {message.activeSkills.map((skillName) => {
            const info = SKILL_LABELS[skillName] ?? {
              label: skillName,
              tone: "accent" satisfies AgentSkillTone,
            };

            return (
              <span
                key={skillName}
                className="imagine-tone-chip flex items-center gap-1 rounded-md border px-2 py-0.5 font-sans text-[10px] font-medium transition-transform duration-200 select-none"
                data-tone={info.tone}
                title={`Activated Domain Skill: ${skillName}`}
              >
                {info.label}
              </span>
            );
          })}
        </div>
      )}

      {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 opacity-70">
          {message.toolCalls.map((toolCall, index) => {
            const label = TOOL_LABELS[toolCall.name] || toolCall.name;
            return (
              <span
                key={`${toolCall.name}-${index}`}
                className="imagine-agent-tool-chip"
                title={JSON.stringify(toolCall.args)}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}

      <div className={`overflow-y-auto px-3 py-2 text-xs inline-block leading-relaxed ${
        message.role === "user"
          ? "imagine-agent-bubble-user font-medium"
          : "imagine-agent-bubble-assistant"
      }`}>
        {message.role === "assistant" ? renderAgentContent(message.content) : message.content}
      </div>

      {message.role === "assistant" && message.thought && (
        <details className="group self-start outline-none">
          <summary className="imagine-agent-thought-summary outline-none">
            <span className="font-mono">思考过程</span>
            <ChevronRight className="h-3 w-3 transform transition group-open:rotate-90" />
          </summary>
          <div className="imagine-agent-thought-body">
            {message.thought}
          </div>
        </details>
      )}

      {message.role === "assistant" && executableAction && pendingAction && (
        <div className="imagine-agent-action-panel">
          <span className="imagine-agent-action-panel-title">
            {canEditAction ? "建议动作 · 执行前可调整" : "建议动作 · 参数摘要"}
          </span>

          <div className="imagine-agent-action-panel-body">
            <p>
              <strong className="imagine-tone-icon" data-tone="accent">操作:</strong>{" "}
              <code className="imagine-tone-chip rounded px-1 py-0.5 font-mono text-[10px]" data-tone="accent">
                {ACTION_LABELS[executableAction.type]}
              </code>
            </p>
          </div>

          {canEditAction ? (
            <AgentPendingActionEditor
              action={pendingAction}
              audioModelGroups={audioModelGroups}
              imageModelGroups={imageModelGroups}
              videoModelGroups={videoModelGroups}
              onChange={nextAction => onUpdateActionDraft(message.id, nextAction)}
            />
          ) : (
            <AgentActionSummary action={pendingAction} />
          )}

          <div className="flex gap-2.5 mt-3 pt-2.5 border-t border-white/5">
            {canEditAction && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onExecuteAction(message.id, pendingAction);
                  }}
                  data-tone="accent"
                  data-size="compact"
                  className="imagine-primary-action flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-bold text-white transition"
                >
                  <Check className="h-3 w-3" />
                  执行
                </button>
                <button
                  type="button"
                  onClick={() => onDeclineAction(message.id)}
                  className="imagine-secondary-action border border-[var(--iw-border)] hover:border-[var(--iw-muted)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] hover:text-[var(--iw-text)] py-1.5 px-3 rounded-lg text-[10px] cursor-pointer transition"
                  data-action="danger"
                >
                  拒绝
                </button>
              </>
            )}

            {message.interactiveState === "completed" && (
              <span className="imagine-tone-chip flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium" data-tone="success">
                <Check className="h-3 w-3" />
                创意流程已触发并加载完毕
              </span>
            )}

            {message.interactiveState === "declined" && (
              <span className="imagine-agent-action-declined">方案已被拒绝/驳回</span>
            )}
          </div>

          {activeCountdownId === message.id && message.interactiveState === "idle" && (
            <div className="mt-2 text-center">
              <div className="h-1 bg-white/5 rounded overflow-hidden">
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: countdownSeconds, ease: "linear" }}
                  className="h-full bg-blue-500"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] mt-1.5 font-mono">
                <span className="imagine-tone-icon" data-tone="accent">自动模式: {countdownSeconds} 秒后执行</span>
                <button onClick={onCancelCountdown} className="imagine-tone-link cursor-pointer underline" data-tone="danger">
                  取消自动
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {message.role === "assistant" && message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 self-start">
          {message.suggestedFollowUps.map((prompt, index) => (
            <button
              key={`${prompt}-${index}`}
              onClick={() => onSuggestedPrompt(prompt)}
              className="imagine-agent-follow-up"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const AgentDock = forwardRef<HTMLElement, AgentDockProps>(function AgentDock(
  {
    activeCountdownId,
    agentReferenceId,
    agentReferences,
    agentReferenceUrl,
    atDropdownNode,
    audioModelGroups,
    autoExecute,
    chatBottomRef,
    chatModelGroups,
    countdownSeconds,
    input,
    isLoading,
    isOpen,
    messages,
    selectedChatModel,

    onSelectChatModel,
    onCancelCountdown,
    onChangeInput,
    onClearChat,
    onClearReference,
    imageModelGroups,
    videoModelGroups,
    onDeclineAction,
    onExecuteAction,
    onUpdateActionDraft,
    onMaskReference,
    onSubmit,
    onSuggestedPrompt,
    onToggleAutoExecute,
    onToggleOpen,
    onUploadReference,
  },
  ref,
) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };
  const sendableAgentReferences = getSendableAgentMediaReferences(
    agentReferences,
    agentReferenceId,
    agentReferenceUrl,
  );
  const hasSendableAgentReferences = sendableAgentReferences.length > 0;
  const visibleAgentReference = agentReferenceUrl
    ? sendableAgentReferences.find(reference => reference.id === agentReferenceId) ??
      sendableAgentReferences.find(reference => reference.url === agentReferenceUrl) ??
      null
    : null;
  const visibleAgentReferenceType = visibleAgentReference ? getMediaReferenceType(visibleAgentReference) : null;
  const hasVisibleAgentReference = visibleAgentReference !== null && visibleAgentReferenceType !== null;
  const [inputSupportLookup, setInputSupportLookup] = useState<{
    inputSupport: AgentReferenceInputSupport | null;
    model: string;
  } | null>(null);
  const [orbPosition, setOrbPosition] = useState<AgentOrbPosition | null>(null);
  const [isOrbDragging, setIsOrbDragging] = useState(false);
  const dockRef = useRef<HTMLElement | null>(null);
  const orbDragRef = useRef<AgentOrbDragState | null>(null);
  const suppressOrbClickRef = useRef(false);
  const setDockRef = useCallback((element: HTMLElement | null): void => {
    dockRef.current = element;
    assignRef(ref, element);
  }, [ref]);

  useEffect(() => {
    if (!hasSendableAgentReferences || !selectedChatModel.trim()) {
      return;
    }

    const controller = new AbortController();
    const model = selectedChatModel;
    void fetch(`/api/model-vision-support?model=${encodeURIComponent(model)}`, {
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) return null;
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null) {
          return null;
        }
        const inputSupport = "inputSupport" in payload ? payload.inputSupport : null;
        if (typeof inputSupport === "object" && inputSupport !== null) {
          return {
            audio: "audio" in inputSupport && typeof inputSupport.audio === "boolean" ? inputSupport.audio : null,
            image: "image" in inputSupport && typeof inputSupport.image === "boolean" ? inputSupport.image : null,
            video: "video" in inputSupport && typeof inputSupport.video === "boolean" ? inputSupport.video : null,
          } satisfies AgentReferenceInputSupport;
        }
        const supportsVision = "supportsVision" in payload ? payload.supportsVision : null;
        return {
          audio: null,
          image: typeof supportsVision === "boolean" ? supportsVision : null,
          video: null,
        } satisfies AgentReferenceInputSupport;
      })
      .then(inputSupport => {
        if (!controller.signal.aborted) {
          setInputSupportLookup({ inputSupport, model });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setInputSupportLookup({ inputSupport: null, model });
        }
      });

    return () => controller.abort();
  }, [hasSendableAgentReferences, selectedChatModel]);

  useLayoutEffect(() => {
    setOrbPosition(getInitialAgentOrbPosition());
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setOrbPosition(previousPosition => {
        const nextPosition = clampAgentOrbPosition(previousPosition ?? getDefaultAgentOrbPosition());
        persistAgentOrbPosition(nextPosition);
        return nextPosition;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const openRouterInputSupport =
    hasSendableAgentReferences && inputSupportLookup?.model === selectedChatModel
      ? inputSupportLookup.inputSupport
      : null;

  const agentReferenceHint = formatAgentReferenceHint(sendableAgentReferences, openRouterInputSupport);
  const isIdleOrb = !isOpen && !isLoading && input.trim().length === 0;

  useLayoutEffect(() => {
    applyThemeClassesToDom(resolveThemeMode());
  }, [isIdleOrb]);

  const idleOrbStyle = isIdleOrb && orbPosition
    ? {
      bottom: "auto",
      left: orbPosition.x,
      right: "auto",
      top: orbPosition.y,
    } satisfies CSSProperties
    : undefined;

  const dockShellClass = isIdleOrb
    ? "imagine-agent-dock imagine-agent-dock-idle-orb imagine-theme-dark pointer-events-none fixed bottom-12 right-4 z-40 flex h-[108px] w-[108px] sm:bottom-16 sm:right-10"
    : "imagine-agent-dock imagine-agent-dock-panel imagine-theme-dark pointer-events-auto fixed inset-x-4 bottom-12 z-50 mx-auto w-[calc(100vw-32px)] max-w-5xl rounded-lg p-3 sm:bottom-16 sm:w-[min(1040px,calc(100vw-40px))]";
  const dockStateClass = [
    isIdleOrb && isOrbDragging ? "is-dragging" : "",
  ].filter(Boolean).join(" ");

  useGSAP(() => {
    const root = dockRef.current;
    if (!root || !isOpen || isIdleOrb || prefersReducedWorkbenchMotion()) return;

    gsap.timeline({ defaults: { ease: WORKBENCH_GSAP_EASE } })
      .fromTo(root, { scale: 0.985, y: 8 }, { scale: 1, y: 0, duration: 0.28 }, 0)
      .fromTo(
        ".imagine-agent-motion-item",
        { opacity: 0, y: 8 },
        { opacity: 1, stagger: 0.045, y: 0, duration: 0.24 },
        0.04,
      )
      .fromTo(
        ".imagine-agent-bubble-assistant, .imagine-agent-bubble-user, .imagine-agent-loading",
        { opacity: 0, y: 6 },
        { opacity: 1, stagger: 0.025, y: 0, duration: 0.22 },
        0.12,
      );
  }, { dependencies: [isIdleOrb, isOpen], scope: dockRef });

  const updateOrbDragPosition = (clientX: number, clientY: number, pointerId: number) => {
    const drag = orbDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;

    const deltaX = clientX - drag.startX;
    const deltaY = clientY - drag.startY;
    if (
      !drag.moved &&
      Math.abs(deltaX) < AGENT_ORB_DRAG_THRESHOLD &&
      Math.abs(deltaY) < AGENT_ORB_DRAG_THRESHOLD
    ) {
      return;
    }

    drag.moved = true;
    const nextPosition = clampAgentOrbPosition({
      x: drag.origin.x + deltaX,
      y: drag.origin.y + deltaY,
    });
    drag.current = nextPosition;
    setOrbPosition(nextPosition);
  };

  const finishOrbDrag = (pointerId: number) => {
    const drag = orbDragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;

    orbDragRef.current = null;
    setIsOrbDragging(false);

    if (drag.moved) {
      suppressOrbClickRef.current = true;
      persistAgentOrbPosition(drag.current);
    }
  };

  useEffect(() => {
    if (!isOrbDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      updateOrbDragPosition(event.clientX, event.clientY, event.pointerId);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      finishOrbDrag(event.pointerId);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [isOrbDragging]);

  const handleOrbPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = clampAgentOrbPosition({ x: rect.left, y: rect.top });
    orbDragRef.current = {
      current: origin,
      moved: false,
      origin,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.preventDefault();
    setIsOrbDragging(true);
  };

  const handleOrbClick = () => {
    orbDragRef.current = null;
    setIsOrbDragging(false);
    if (suppressOrbClickRef.current) {
      suppressOrbClickRef.current = false;
      return;
    }
    onToggleOpen();
  };

  return (
    <section
      ref={setDockRef}
      className={`${dockShellClass}${dockStateClass ? ` ${dockStateClass}` : ""}`}
      style={isIdleOrb ? idleOrbStyle : undefined}
    >
      {isIdleOrb ? (
        <button
          type="button"
          onClick={handleOrbClick}
          onPointerDown={handleOrbPointerDown}
          className="imagine-agent-orb-button pointer-events-auto group relative flex h-[108px] w-[108px] items-center justify-center rounded-full"
          title="展开 Agent 对话"
          aria-label="展开 Agent 对话"
        >
          <span className="imagine-agent-orb-aura" />
          <AgentIdentityMark variant="orb" />
        </button>
      ) : (
        <>
      <div className={`imagine-agent-motion-item ${isOpen ? "mb-2.5" : "mb-1.5"} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={onToggleOpen}
          className="imagine-agent-dock-header-btn flex min-w-0 items-center gap-2 text-left text-sm font-semibold"
          title={isOpen ? "收起 Agent 对话" : "展开 Agent 对话"}
        >
          <AgentIdentityMark variant="header" />
          <span className="min-w-0 truncate">Agent</span>
          <ChevronRight className={`h-3 w-3 text-[var(--iw-faint)] transition ${isOpen ? "rotate-90" : "-rotate-90"}`} />
        </button>

        <div className="imagine-agent-dock-toolbar pointer-events-auto hidden min-w-0 flex-1 items-center justify-center gap-2 sm:flex">
          {chatModelGroups.length > 0 || selectedChatModel ? (
            <AgentModelSelect
              groups={chatModelGroups}
              hint={agentReferenceHint}
              value={selectedChatModel}
              onChange={onSelectChatModel}
              className="max-w-[min(14rem,100%)]"
            />
          ) : null}
        </div>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="imagine-agent-dock-status hidden items-center gap-1.5 lg:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
            {hasSendableAgentReferences ? "引用中" : "画廊"}
          </span>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={onClearChat}
              data-action="danger"
              className="imagine-icon-button flex h-5 w-5 items-center justify-center rounded border border-[var(--iw-border)] text-[var(--iw-faint)] transition"
              title="清空对话"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      </div>

      <div
        className={`imagine-agent-motion-item imagine-agent-message-stream max-h-[min(46vh,440px)] pr-1 ${isOpen ? "is-open" : ""}`}
        aria-hidden={!isOpen}
      >
        <div className="imagine-agent-message-stream-inner max-h-[min(46vh,440px)] overflow-y-auto flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {isOpen ? (
            <>
              {messages.map((message) => (
                <AgentMessage
                  key={message.id}
                  activeCountdownId={activeCountdownId}
                  countdownSeconds={countdownSeconds}
                  message={message}
                  onCancelCountdown={onCancelCountdown}
                  audioModelGroups={audioModelGroups}
                  imageModelGroups={imageModelGroups}
                  videoModelGroups={videoModelGroups}
                  onDeclineAction={onDeclineAction}
                  onExecuteAction={onExecuteAction}
                  onUpdateActionDraft={onUpdateActionDraft}
                  onSuggestedPrompt={onSuggestedPrompt}
                />
              ))}

              {isLoading && (
                <div className="flex max-w-[90%] flex-col gap-1.5 self-start">
                  <span className="imagine-agent-role-label imagine-tone-icon" data-tone="violet">Agent</span>
                  <div className="imagine-agent-loading px-4 py-3 text-xs text-[var(--iw-muted)] flex items-center gap-2">
                    <RefreshCw className="imagine-tone-icon h-3.5 w-3.5 animate-spin" data-tone="violet" />
                    <span>正在分析画廊与技能，整理下一步建议...</span>
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </>
          ) : null}
        </div>
      </div>

      <div className={`imagine-agent-motion-item ${isOpen ? "imagine-agent-dock-input-divider pt-3 mt-2" : ""} flex flex-col gap-3`}>
        {hasVisibleAgentReference && (
          <div className="imagine-agent-reference-strip flex items-center justify-between gap-3 p-2 animate-fade-in mb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="imagine-agent-ref-thumb relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                {renderAgentReferencePreview(visibleAgentReferenceType, visibleAgentReference.url)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="imagine-tone-icon text-[10px] font-bold" data-tone="violet">
                  {mediaReferenceLabel(visibleAgentReferenceType)}引用
                </span>
                <span className="max-w-[150px] truncate font-mono text-[9px] text-[var(--iw-faint)]">
                  ID: {visibleAgentReference.id.substring(0, 16)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {visibleAgentReferenceType === "image" ? (
                <button
                  type="button"
                  onClick={onMaskReference}
                  className="imagine-tone-chip flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold transition"
                  data-tone="accent"
                  title="使用画笔抹除或标记局部涂层"
                >
                  <Paintbrush className="h-3 w-3" />
                  画笔涂抹
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClearReference}
                data-action="danger"
                className="imagine-icon-button p-1 bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] rounded-lg transition border border-[var(--iw-border)] cursor-pointer"
                title="取消引用"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {chatModelGroups.length > 0 || selectedChatModel ? (
          <div className="pointer-events-auto flex flex-col gap-1.5 sm:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="agent-model-select-mobile" className="text-[10px] font-semibold text-[var(--iw-faint)]">
                模型
              </label>
              <AgentModelSelect
                id="agent-model-select-mobile"
                groups={chatModelGroups}
                value={selectedChatModel}
                onChange={onSelectChatModel}
                className="min-w-0 flex-1"
              />
            </div>
            {agentReferenceHint ? (
              <span className="imagine-tone-icon text-[10px] leading-snug" data-tone="violet">{agentReferenceHint}</span>
            ) : null}
          </div>
        ) : null}

        <div className="imagine-agent-input-row grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="relative min-w-0">
            {atDropdownNode}
            <form onSubmit={submit} className="relative flex items-center w-full">
              <label
                className="imagine-agent-attach-btn absolute left-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md"
                title="上传媒体到 Agent 引用"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <input type="file" accept="image/*,video/*,audio/*" onChange={onUploadReference} className="hidden" />
              </label>
              <input
                type="text"
                value={input}
                onChange={(event) => onChangeInput(event.target.value)}
                placeholder="问 Agent... 输入 @ 引用媒体"
                className="imagine-agent-input w-full py-2.5 pl-12 pr-11 text-xs text-[var(--iw-text)] placeholder:text-[var(--iw-faint)]"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                data-tone="accent"
                data-size="compact"
                className={`imagine-primary-action absolute right-2 flex items-center justify-center rounded-lg px-3 py-1.5 font-bold text-white transition ${
                  isLoading || !input.trim() ? "cursor-not-allowed" : "cursor-pointer active:scale-95"
                }`}
              >
                <Send className="h-3 w-3" />
              </button>
            </form>
          </div>

          <label
            htmlFor="auto_trigger"
            className="imagine-agent-auto-toggle flex h-9 shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-medium transition"
            data-active={autoExecute ? "true" : "false"}
            title="自动执行 Agent action"
          >
            <span className={`h-2 w-2 rounded-full ${autoExecute ? "bg-emerald-300" : "bg-[var(--iw-faint)]"}`} />
            <span>自动</span>
            <input
              type="checkbox"
              id="auto_trigger"
              checked={autoExecute}
              onChange={(event) => onToggleAutoExecute(event.target.checked)}
              className="sr-only"
            />
          </label>
        </div>
      </div>
        </>
      )}
    </section>
  );
});

export default AgentDock;
