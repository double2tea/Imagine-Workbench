"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileText, ImageIcon, Loader2, LocateFixed, Music, Square, Video, XCircle } from "lucide-react";
import type { BoardNode } from "@/lib/board";
import { findResultNodeForSource } from "@/lib/board/utils";
import type { GenerationTask, GenerationTaskStatus } from "@/lib/generation-tasks";

interface BoardTaskQueuePanelProps {
  cancelingTaskIds?: readonly string[];
  nodes: BoardNode[];
  onCancelTask: (task: GenerationTask) => void;
  onFocusNode: (nodeId: string) => void;
  tasks: GenerationTask[];
}

const iconClassName = "h-3.5 w-3.5";
const actionButtonClassName = "nodrag flex h-7 items-center gap-1 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2 text-[10px] font-semibold text-[var(--iw-muted)] transition hover:border-blue-400/45 hover:text-[var(--iw-text)] disabled:cursor-not-allowed disabled:opacity-45";

function mediaIcon(task: GenerationTask) {
  if (task.mediaType === "image") return <ImageIcon className={`${iconClassName} text-blue-300`} />;
  if (task.mediaType === "video") return <Video className={`${iconClassName} text-violet-300`} />;
  if (task.mediaType === "audio") return <Music className={`${iconClassName} text-cyan-300`} />;
  return <FileText className={`${iconClassName} text-teal-300`} />;
}

function statusIcon(status: GenerationTaskStatus) {
  if (status === "processing") return <Loader2 className={`${iconClassName} animate-spin text-sky-300`} />;
  if (status === "pending") return <Clock3 className={`${iconClassName} text-amber-300`} />;
  if (status === "failed") return <AlertTriangle className={`${iconClassName} text-red-300`} />;
  if (status === "canceled") return <XCircle className={`${iconClassName} text-[var(--iw-faint)]`} />;
  return <CheckCircle2 className={`${iconClassName} text-emerald-300`} />;
}

function statusLabel(status: GenerationTaskStatus): string {
  if (status === "processing") return "处理中";
  if (status === "pending") return "排队";
  if (status === "failed") return "失败";
  if (status === "canceled") return "已取消";
  return "完成";
}

function statusToneClass(status: GenerationTaskStatus): string {
  if (status === "processing") return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  if (status === "pending") return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  if (status === "failed") return "border-red-400/25 bg-red-500/10 text-red-200";
  if (status === "canceled") return "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-faint)]";
  return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
}

function progressClass(status: GenerationTaskStatus): string {
  if (status === "failed") return "bg-red-400";
  if (status === "complete") return "bg-emerald-400";
  if (status === "canceled") return "bg-[var(--iw-faint)]";
  return "bg-sky-400";
}

function taskTitle(task: GenerationTask, sourceNode: BoardNode | undefined): string {
  if (sourceNode) return sourceNode.title;
  if (task.prompt.trim()) return task.prompt;
  return task.model;
}

function TaskRow({
  canceling,
  nodes,
  onCancelTask,
  onFocusNode,
  task,
}: {
  canceling: boolean;
  nodes: BoardNode[];
  onCancelTask: (task: GenerationTask) => void;
  onFocusNode: (nodeId: string) => void;
  task: GenerationTask;
}) {
  const sourceNode = task.source.boardNodeId
    ? nodes.find(node => node.id === task.source.boardNodeId)
    : undefined;
  const resultNode = sourceNode ? findResultNodeForSource(nodes, sourceNode.id) : undefined;
  const canCancel = task.status === "pending" || task.status === "processing";
  const progress = task.status === "complete" || task.status === "canceled" ? 100 : task.progress;

  return (
    <article className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)]">
            {mediaIcon(task)}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              {statusIcon(task.status)}
              <h3 className="truncate text-xs font-semibold text-[var(--iw-text)]" title={taskTitle(task, sourceNode)}>
                {taskTitle(task, sourceNode)}
              </h3>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--iw-faint)]" title={task.model}>
              {task.model}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusToneClass(task.status)}`}>
          {statusLabel(task.status)}
        </span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--iw-panel)]">
        <div className={`h-full rounded-full ${progressClass(task.status)}`} style={{ width: `${progress}%` }} />
      </div>

      {task.errorMessage ? (
        <p className="mt-2 line-clamp-2 rounded-md border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] leading-4 text-red-200">
          {task.errorMessage}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={!sourceNode}
          className={actionButtonClassName}
          onClick={() => {
            if (sourceNode) onFocusNode(sourceNode.id);
          }}
        >
          <LocateFixed className="h-3 w-3" />
          源节点
        </button>
        <button
          type="button"
          disabled={!resultNode}
          className={actionButtonClassName}
          onClick={() => {
            if (resultNode) onFocusNode(resultNode.id);
          }}
        >
          <CheckCircle2 className="h-3 w-3" />
          结果节点
        </button>
        {canCancel ? (
          <button
            type="button"
            disabled={!sourceNode || canceling}
            className="nodrag flex h-7 items-center gap-1 rounded-md border border-red-400/25 bg-red-500/10 px-2 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => onCancelTask(task)}
          >
            {canceling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            取消
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TaskSection({
  cancelingTaskIds,
  nodes,
  onCancelTask,
  onFocusNode,
  tasks,
  title,
}: {
  cancelingTaskIds: readonly string[];
  nodes: BoardNode[];
  onCancelTask: (task: GenerationTask) => void;
  onFocusNode: (nodeId: string) => void;
  tasks: GenerationTask[];
  title: string;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-[var(--iw-muted)]">{title}</h2>
        <span className="font-mono text-[10px] text-[var(--iw-faint)]">{tasks.length}</span>
      </div>
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          canceling={cancelingTaskIds.includes(task.id)}
          nodes={nodes}
          onCancelTask={onCancelTask}
          onFocusNode={onFocusNode}
          task={task}
        />
      ))}
    </section>
  );
}

export default function BoardTaskQueuePanel({
  cancelingTaskIds = [],
  nodes,
  onCancelTask,
  onFocusNode,
  tasks,
}: BoardTaskQueuePanelProps) {
  const activeTasks = tasks.filter(task => task.status === "pending" || task.status === "processing");
  const failedTasks = tasks.filter(task => task.status === "failed");
  const recentTasks = tasks.filter(task => task.status === "complete" || task.status === "canceled").slice(0, 5);
  const badgeCount = activeTasks.length + failedTasks.length;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs leading-5 text-[var(--iw-muted)]">
          当前画板暂无生成任务。运行生成节点后，进度、失败和取消操作会出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
      <div className="grid grid-cols-3 gap-1.5">
        <span className="rounded-lg border border-sky-400/20 bg-sky-500/10 px-2 py-1.5 text-center text-[10px] font-semibold text-sky-100">
          运行 {activeTasks.length}
        </span>
        <span className="rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1.5 text-center text-[10px] font-semibold text-red-200">
          失败 {failedTasks.length}
        </span>
        <span className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-center text-[10px] font-semibold text-[var(--iw-muted)]">
          待处理 {badgeCount}
        </span>
      </div>
      <TaskSection
        cancelingTaskIds={cancelingTaskIds}
        nodes={nodes}
        onCancelTask={onCancelTask}
        onFocusNode={onFocusNode}
        tasks={activeTasks}
        title="运行中"
      />
      <TaskSection
        cancelingTaskIds={cancelingTaskIds}
        nodes={nodes}
        onCancelTask={onCancelTask}
        onFocusNode={onFocusNode}
        tasks={failedTasks}
        title="需要处理"
      />
      <TaskSection
        cancelingTaskIds={cancelingTaskIds}
        nodes={nodes}
        onCancelTask={onCancelTask}
        onFocusNode={onFocusNode}
        tasks={recentTasks}
        title="最近完成"
      />
    </div>
  );
}
