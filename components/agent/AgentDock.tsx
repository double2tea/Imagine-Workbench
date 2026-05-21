import type { FormEvent, ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { Check, ChevronRight, Paintbrush, RefreshCw, Send, Sparkles, X } from "lucide-react";
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
          <strong key={`${part}-${index}`} className="font-semibold text-slate-100">
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
      <span className={`text-[10px] font-mono tracking-widest ${
        message.role === "user" ? "text-right text-slate-500" : "text-left text-blue-400 font-bold"
      }`}>
        {message.role === "user" ? "YOU" : "CREATIVE AGENT"}
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
                className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/80 text-slate-400 font-mono"
                title={JSON.stringify(toolCall.args)}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}

      <div className={`overflow-y-auto rounded-lg px-3 py-2 text-xs inline-block leading-relaxed ${
        message.role === "user"
          ? "max-w-[min(620px,86vw)] bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-medium rounded-tr-none shadow-[0_4px_15px_rgba(37,99,235,0.25)]"
          : "max-h-64 w-[min(760px,calc(100vw-72px))] bg-slate-900/82 border border-slate-700/60 text-slate-200 rounded-tl-none"
      }`}>
        {message.role === "assistant" ? renderAgentContent(message.content) : message.content}
      </div>

      {message.role === "assistant" && message.thought && (
        <details className="group self-start outline-none">
          <summary className="text-[10px] text-slate-500 select-none cursor-pointer outline-none hover:text-slate-350 group-open:text-blue-400 flex items-center gap-1">
            <span className="font-mono">思考过程</span>
            <ChevronRight className="h-3 w-3 transform transition group-open:rotate-90 text-slate-500" />
          </summary>
          <div className="mt-1.5 max-w-[min(760px,calc(100vw-72px))] p-2.5 bg-black/40 rounded-lg border border-white/5 text-[10px] font-mono text-slate-400 whitespace-pre-line leading-normal">
            {message.thought}
          </div>
        </details>
      )}

      {message.role === "assistant" && message.recommendedAction && message.recommendedAction.type !== "none" && (
        <div className="mt-2.5 w-[min(760px,calc(100vw-72px))] rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 shadow-inner">
          <span className="text-[10px] text-blue-400 font-mono tracking-widest font-bold block mb-2">建议动作</span>

          <div className="text-xs text-slate-200 flex flex-col gap-1.5">
            <p>
              <strong className="text-blue-400">操作:</strong>{" "}
              <code className="bg-black/30 px-1 py-0.5 rounded text-[10px] font-mono text-blue-300">
                {ACTION_LABELS[message.recommendedAction.type]}
              </code>
            </p>

            {message.recommendedAction.params?.prompt && (
              <p className="leading-normal">
                <strong className="text-blue-400">规划提示词:</strong>{" "}
                <span className="italic text-slate-300">
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
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-3 rounded-lg text-[10px] flex items-center justify-center gap-1 shadow-md hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer transition"
                >
                  <Check className="h-3 w-3" />
                  执行
                </button>
                <button
                  type="button"
                  onClick={() => onDeclineAction(message.id)}
                  className="border border-white/5 hover:border-white/10 bg-white/5 text-slate-400 hover:text-slate-200 py-1.5 px-3 rounded-lg text-[10px] cursor-pointer transition"
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
              <span className="text-[10px] text-slate-600 italic">方案已被拒绝/驳回</span>
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
                <span className="text-blue-400">⏱️ 自动模式: 将在 {countdownSeconds} 秒后自主运行</span>
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
              className="text-[10px] rounded-full border border-white/5 hover:border-blue-500/25 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 px-3 py-1 transition text-left cursor-pointer"
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
    isOverContent,
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
  },
  ref,
) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <section
      ref={ref}
      className={`imagine-agent-dock imagine-theme-${themeMode} fixed inset-x-4 bottom-12 z-40 mx-auto w-[calc(100vw-32px)] max-w-5xl rounded-lg border border-slate-700/70 bg-[#0b0d13]/96 p-3 text-slate-200 shadow-[0_18px_54px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100 sm:bottom-16 sm:w-[min(1040px,calc(100vw-40px))] ${
        isOverContent ? "opacity-[0.84]" : "opacity-100"
      }`}
    >
      <div className={`${isOpen ? "mb-2.5" : "mb-1.5"} grid grid-cols-[auto_1fr_auto] items-center gap-2`}>
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-slate-200 transition hover:text-white"
          title={isOpen ? "收起 Agent 对话" : "展开 Agent 对话"}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-blue-400/20 bg-blue-500/12">
            <Sparkles className="h-3.5 w-3.5 text-blue-200" />
          </span>
          <span className="min-w-0 truncate">Agent</span>
          <ChevronRight className={`h-3 w-3 text-slate-500 transition ${isOpen ? "rotate-90" : "-rotate-90"}`} />
        </button>

        <span className="h-px bg-gradient-to-r from-slate-700/60 via-slate-800/40 to-transparent" />

        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 font-mono text-[10px] text-slate-500 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
            {agentReferenceId || agentReferenceUrl ? "引用中" : "画廊"}
          </span>
          {messages.length > 1 && (
            <button
              type="button"
              onClick={onClearChat}
              className="flex h-5 w-5 items-center justify-center rounded border border-slate-700/60 text-slate-500 transition hover:border-red-500/30 hover:text-red-400"
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
            className="max-h-[min(46vh,440px)] overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
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
              <div className="flex flex-col max-w-[90%] gap-1.5 self-start">
                <span className="text-[10px] font-mono tracking-widest text-blue-400 animate-pulse">
                  AGENT COMPILING THOUGHTS
                </span>
                <div className="rounded-xl px-4 py-3 bg-slate-900/80 border border-slate-700/60 text-slate-300 text-xs flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
                  <span>智囊团正在研判画廊状态，筹备提示词设计框架...</span>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`${isOpen ? "border-t border-white/5 pt-3 mt-2" : ""} flex flex-col gap-3`}>
        {(agentReferenceId || agentReferenceUrl) && (
          <div className="flex items-center justify-between gap-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl animate-fade-in mb-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden border border-blue-500/30 bg-slate-950">
                <PreviewImage src={agentReferenceUrl || ""} alt="agent ref" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-blue-400">📎 局部编辑参考图 (Referenced Image)</span>
                <span className="text-[9px] font-mono text-slate-400 truncate max-w-[150px]">
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
                className="p-1 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition border border-white/5 cursor-pointer"
                title="取消引用"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="relative min-w-0">
            {atDropdownNode}
            <form onSubmit={submit} className="relative flex items-center w-full">
              <input
                type="text"
                value={input}
                onChange={(event) => onChangeInput(event.target.value)}
                placeholder="问 Agent... 输入 @ 引用完成图"
                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/70 py-2.5 pl-3.5 pr-11 text-xs text-slate-100 placeholder-slate-500 transition focus:border-blue-400/45 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={`absolute right-2 px-3 py-1.5 rounded-lg text-white font-bold transition flex items-center justify-center ${
                  isLoading || !input.trim()
                    ? "bg-white/5 text-slate-600"
                    : "bg-blue-600 hover:bg-blue-500 active:scale-95 cursor-pointer shadow-md shadow-blue-500/10"
                }`}
              >
                <Send className="h-3 w-3" />
              </button>
            </form>
          </div>

          <label
            htmlFor="auto_trigger"
            className={`flex h-9 shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-medium transition ${
              autoExecute
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-slate-700/70 bg-slate-950/45 text-slate-400 hover:text-slate-200"
            }`}
            title="自动执行 Agent action"
          >
            <span className={`h-2 w-2 rounded-full ${autoExecute ? "bg-emerald-300" : "bg-slate-600"}`} />
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
    </section>
  );
});

export default AgentDock;
