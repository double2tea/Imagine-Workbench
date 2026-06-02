import type { ChangeEvent, FormEvent, ReactNode, Ref } from "react";
import { forwardRef, useEffect, useRef } from "react";
import { Check, ChevronRight, ImagePlus, Paintbrush, RefreshCw, Send, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import PreviewImage from "@/components/PreviewImage";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thought?: string;
  recommendedAction?: {
    type: "none" | "optimize_prompt" | "generate_image" | "edit_image" | "generate_video";
    params?: {
      prompt?: string;
      model?: string;
      aspectRatio?: string;
      referenceImageId?: string;
    };
  };
  suggestedFollowUps?: string[];
  interactiveState?: "idle" | "executing" | "completed" | "declined";
  activeSkills?: string[];
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

export type AgentToolAction = NonNullable<ChatMessage["recommendedAction"]>;

interface AgentDockProps {
  activeCountdownId: string | null;
  agentReferenceId: string | null;
  agentReferenceUrl: string | null;
  atDropdownNode: ReactNode;
  autoExecute: boolean;
  chatBottomRef: Ref<HTMLDivElement>;
  countdownSeconds: number;
  input: string;
  isLoading: boolean;
  isOpen: boolean;
  isOverContent: boolean;
  messages: ChatMessage[];
  themeMode: "light" | "dark";
  onCancelCountdown: () => void;
  onChangeInput: (value: string) => void;
  onClearChat: () => void;
  onClearReference: () => void;
  onDeclineAction: (messageId: string) => void;
  onExecuteAction: (messageId: string, action: AgentToolAction) => void;
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

const TOOL_LABELS: Record<string, string> = {
  query_models: "查询模型",
  get_skill_info: "查询技能",
  get_gallery_assets: "搜索资产",
  get_prompt_blueprint: "获取模板",
};

const SKILL_LABELS: Record<string, { label: string; className: string }> = {
  PromptEngineer: { label: "提示词工程", className: "bg-teal-500/12 text-teal-300 border-teal-500/20" },
  ImageGenerator: { label: "智能生图", className: "bg-rose-500/12 text-rose-300 border-rose-500/20" },
  VideoGenerator: { label: "视频合成", className: "bg-purple-500/12 text-purple-300 border-purple-500/20" },
  ImageEditor: { label: "局部重绘", className: "bg-amber-500/12 text-amber-300 border-amber-500/20" },
  CreativePlanner: { label: "创意规划", className: "bg-indigo-500/12 text-indigo-300 border-indigo-500/20" },
  SessionHistoryRetriever: { label: "历史回退", className: "bg-sky-500/12 text-sky-300 border-sky-500/20" },
  VariationSuggester: { label: "变体推荐", className: "bg-emerald-500/12 text-emerald-300 border-emerald-500/20" },
  AsyncTaskManager: { label: "后台跟踪", className: "bg-cyan-500/12 text-cyan-300 border-cyan-500/20" },
  ProjectSummarizer: { label: "资产汇总", className: "bg-violet-500/12 text-violet-300 border-violet-500/20" },
  ExportManager: { label: "批量导出", className: "bg-red-500/12 text-red-300 border-red-500/20" },
};

const ACTION_LABELS: Record<AgentToolAction["type"], string> = {
  none: "无操作",
  optimize_prompt: "优化提示词",
  generate_image: "生成图片",
  edit_image: "编辑图片",
  generate_video: "生成视频",
};

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
            <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-md border border-blue-400/18 bg-blue-500/10 px-1.5 text-[10px] font-semibold text-blue-300">
              {line.marker ?? "•"}
            </span>
            <span>{renderInlineEmphasis(line.text)}</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentIdentityMark({ variant }: { variant: "orb" | "header" }) {
  return (
    <span className={`imagine-agent-mark imagine-agent-mark-${variant}`}>
      <span className="imagine-agent-mark-glyph">
        <span className="imagine-agent-mark-node" />
      </span>
    </span>
  );
}

function AgentMessage({
  activeCountdownId,
  countdownSeconds,
  message,
  onCancelCountdown,
  onDeclineAction,
  onExecuteAction,
  onSuggestedPrompt,
}: {
  activeCountdownId: string | null;
  countdownSeconds: number;
  message: ChatMessage;
  onCancelCountdown: () => void;
  onDeclineAction: (messageId: string) => void;
  onExecuteAction: (messageId: string, action: AgentToolAction) => void;
  onSuggestedPrompt: (prompt: string) => void;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${message.role === "user" ? "self-end ml-10" : "self-start mr-10"}`}>
      <span className={`imagine-agent-role-label ${
        message.role === "user" ? "text-right text-[var(--iw-faint)]" : "text-left text-indigo-300"
      }`}>
        {message.role === "user" ? "你" : "Agent"}
      </span>

      {message.role === "assistant" && message.activeSkills && message.activeSkills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-0.5 shadow-sm">
          {message.activeSkills.map((skillName) => {
            const info = SKILL_LABELS[skillName] ?? {
              label: skillName,
              className: "bg-blue-500/10 text-blue-400 border-blue-500/15",
            };

            return (
              <span
                key={skillName}
                className={`text-[10px] px-2 py-0.5 rounded-md border font-sans font-medium flex items-center gap-1 transition-transform duration-200 select-none ${info.className}`}
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

      {message.role === "assistant" && message.recommendedAction && message.recommendedAction.type !== "none" && (
        <div className="imagine-agent-action-panel">
          <span className="imagine-agent-action-panel-title">建议动作</span>

          <div className="imagine-agent-action-panel-body">
            <p>
              <strong className="text-blue-400">操作:</strong>{" "}
              <code className="bg-black/30 px-1 py-0.5 rounded text-[10px] font-mono text-blue-300">
                {ACTION_LABELS[message.recommendedAction.type]}
              </code>
            </p>

            {message.recommendedAction.params?.prompt && (
              <p className="leading-normal">
                <strong className="text-blue-400">规划提示词:</strong>{" "}
                <span className="imagine-agent-action-muted">
                  &ldquo;{message.recommendedAction.params.prompt}&rdquo;
                </span>
              </p>
            )}

            {message.recommendedAction.params?.aspectRatio && (
              <p>
                <strong className="text-blue-400">画素尺寸:</strong>{" "}
                <span className="text-[10px] bg-black/30 px-1 py-0.5 rounded font-mono text-blue-300">
                  {message.recommendedAction.params.aspectRatio}
                </span>
              </p>
            )}
          </div>

          <div className="flex gap-2.5 mt-3 pt-2.5 border-t border-white/5">
            {message.interactiveState === "idle" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (message.recommendedAction) onExecuteAction(message.id, message.recommendedAction);
                  }}
                  className="imagine-primary-action flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-md hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer transition"
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
              <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1.5 px-2 py-1 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
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
                <span className="text-blue-400">自动模式: {countdownSeconds} 秒后执行</span>
                <button onClick={onCancelCountdown} className="text-red-400 hover:text-red-300 underline cursor-pointer">
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
    agentReferenceUrl,
    atDropdownNode,
    autoExecute,
    chatBottomRef,
    countdownSeconds,
    input,
    isLoading,
    isOpen,
    messages,
    themeMode,
    onCancelCountdown,
    onChangeInput,
    onClearChat,
    onClearReference,
    onDeclineAction,
    onExecuteAction,
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
  const isIdleOrb = !isOpen && !isLoading && input.trim().length === 0 && !agentReferenceId && !agentReferenceUrl;
  const orbButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isIdleOrb) return;

    const updateMarkOffset = (event: PointerEvent) => {
      const orbButton = orbButtonRef.current;
      if (!orbButton) return;

      const rect = orbButton.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance === 0) {
        orbButton.style.setProperty("--agent-mark-x", "0px");
        orbButton.style.setProperty("--agent-mark-y", "0px");
        return;
      }

      const gazeStrength = Math.min(distance / 180, 1);
      orbButton.style.setProperty("--agent-mark-x", `${(deltaX / distance) * 4 * gazeStrength}px`);
      orbButton.style.setProperty("--agent-mark-y", `${(deltaY / distance) * 3 * gazeStrength}px`);
    };

    window.addEventListener("pointermove", updateMarkOffset, { passive: true });
    return () => window.removeEventListener("pointermove", updateMarkOffset);
  }, [isIdleOrb]);

  return (
    <AnimatePresence initial={false} mode="wait">
      {isIdleOrb ? (
        <motion.section
          key="agent-orb"
          ref={ref}
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 8 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className={`imagine-agent-dock imagine-agent-dock-idle-orb imagine-theme-${themeMode} fixed bottom-6 right-5 z-40`}
        >
          <button
            ref={orbButtonRef}
            type="button"
            onClick={onToggleOpen}
            className="imagine-agent-orb-button group relative flex h-16 w-16 items-center justify-center rounded-full"
            title="展开 Agent 对话"
            aria-label="展开 Agent 对话"
          >
            <span className="imagine-agent-orb-aura" />
            <AgentIdentityMark variant="orb" />
            <span className="imagine-agent-orb-reminder absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow-lg backdrop-blur">
              Agent
            </span>
          </button>
        </motion.section>
      ) : (
        <motion.section
          key="agent-panel"
          ref={ref}
          initial={{ opacity: 0, scale: 0.98, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.99, y: 10 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className={`imagine-agent-dock imagine-agent-dock-panel imagine-theme-${themeMode} fixed inset-x-4 bottom-12 z-40 mx-auto w-[calc(100vw-32px)] max-w-5xl rounded-lg p-3 sm:bottom-16 sm:w-[min(1040px,calc(100vw-40px))]`}
        >
      <div className={`${isOpen ? "mb-2.5" : "mb-1.5"} grid grid-cols-[auto_1fr_auto] items-center gap-2`}>
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

        <span className="imagine-agent-dock-divider h-px" />

        <span className="flex shrink-0 items-center gap-2">
          <span className="imagine-agent-dock-status hidden items-center gap-1.5 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
            {agentReferenceId || agentReferenceUrl ? "引用中" : "画廊"}
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

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="imagine-agent-message-stream max-h-[min(46vh,440px)] overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
          >
            {messages.map((message) => (
              <AgentMessage
                key={message.id}
                activeCountdownId={activeCountdownId}
                countdownSeconds={countdownSeconds}
                message={message}
                onCancelCountdown={onCancelCountdown}
                onDeclineAction={onDeclineAction}
                onExecuteAction={onExecuteAction}
                onSuggestedPrompt={onSuggestedPrompt}
              />
            ))}

            {isLoading && (
              <div className="flex max-w-[90%] flex-col gap-1.5 self-start">
                <span className="imagine-agent-role-label text-indigo-300">Agent</span>
                <div className="imagine-agent-loading px-4 py-3 text-xs text-[var(--iw-muted)] flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                  <span>正在分析画廊与技能，整理下一步建议...</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`${isOpen ? "imagine-agent-dock-input-divider pt-3 mt-2" : ""} flex flex-col gap-3`}>
        {(agentReferenceId || agentReferenceUrl) && (
          <div className="imagine-agent-reference-strip flex items-center justify-between gap-3 p-2 animate-fade-in mb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="imagine-agent-ref-thumb relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                <PreviewImage src={agentReferenceUrl || ""} alt="agent ref" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-indigo-300">局部编辑参考图</span>
                <span className="max-w-[150px] truncate font-mono text-[9px] text-[var(--iw-faint)]">
                  ID: {agentReferenceId ? agentReferenceId.substring(0, 16) : "Pasted Custom File"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onMaskReference}
                className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600 border border-blue-500/30 text-blue-200 hover:text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                title="使用画笔抹除或标记局部涂层"
              >
                <Paintbrush className="h-3 w-3" />
                画笔涂抹
              </button>
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

        <div className="imagine-agent-input-row grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="relative min-w-0">
            {atDropdownNode}
            <form onSubmit={submit} className="relative flex items-center w-full">
              <label
                className="imagine-agent-attach-btn absolute left-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md"
                title="上传图片到 Agent 引用"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <input type="file" accept="image/*" onChange={onUploadReference} className="hidden" />
              </label>
              <input
                type="text"
                value={input}
                onChange={(event) => onChangeInput(event.target.value)}
                placeholder="问 Agent... 输入 @ 引用完成图"
                className="imagine-agent-input w-full py-2.5 pl-12 pr-11 text-xs text-[var(--iw-text)] placeholder:text-[var(--iw-faint)]"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                  className={`absolute right-2 flex items-center justify-center rounded-lg px-3 py-1.5 font-bold text-white transition ${
                    isLoading || !input.trim()
                      ? "cursor-not-allowed bg-[var(--iw-panel-soft)] text-[var(--iw-faint)]"
                    : "cursor-pointer bg-blue-600 shadow-md shadow-blue-500/10 hover:bg-blue-500 active:scale-95"
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
        </motion.section>
      )}
    </AnimatePresence>
  );
});

export default AgentDock;
