"use client";

import { CheckCircle2, FileText, ImageIcon, Loader2, LocateFixed, Music, RotateCcw, Square, Trash2, Video } from "lucide-react";
import { BoardStatusBadge, BoardStatusIcon, BoardTaskActionButton, BoardTaskProgressBar } from "@/components/board/BoardStatusPrimitives";
import type { BoardNode } from "@/lib/board";
import { findResultNodeForSource } from "@/lib/board/utils";
import type { StorageItem } from "@/lib/db";
import type { GenerationTask } from "@/lib/generation-tasks";
import { useTranslations } from "@/lib/i18n";

interface BoardTaskQueuePanelProps {
  cancelingTaskIds?: readonly string[];
  items: StorageItem[];
  nodes: BoardNode[];
  onCancelTask: (task: GenerationTask) => void;
  onDismissTask: (task: GenerationTask) => void;
  onFocusTaskResult: (task: GenerationTask) => void;
  onFocusNode: (nodeId: string) => void;
  onRerunTaskSource: (task: GenerationTask) => void;
  tasks: GenerationTask[];
}

const iconClassName = "h-3.5 w-3.5";

const mediaTypeLabels: Record<GenerationTask["mediaType"], string> = {
  audio: "音频",
  image: "图片",
  transcript: "文本",
  video: "视频",
};

function mediaIcon(task: GenerationTask) {
  if (task.mediaType === "image") return <ImageIcon className={`imagine-tone-icon ${iconClassName}`} data-tone="accent" />;
  if (task.mediaType === "video") return <Video className={`imagine-tone-icon ${iconClassName}`} data-tone="violet" />;
  if (task.mediaType === "audio") return <Music className={`imagine-tone-icon ${iconClassName}`} data-tone="info" />;
  return <FileText className={`imagine-tone-icon ${iconClassName}`} data-tone="teal" />;
}

function taskTitle(task: GenerationTask, sourceNode: BoardNode | undefined): string {
  if (sourceNode) return sourceNode.title;
  if (task.prompt.trim()) return task.prompt;
  return task.model;
}

function TaskRow({
  canceling,
  items,
  nodes,
  onCancelTask,
  onDismissTask,
  onFocusTaskResult,
  onFocusNode,
  onRerunTaskSource,
  task,
}: {
  canceling: boolean;
  items: StorageItem[];
  nodes: BoardNode[];
  onCancelTask: (task: GenerationTask) => void;
  onDismissTask: (task: GenerationTask) => void;
  onFocusTaskResult: (task: GenerationTask) => void;
  onFocusNode: (nodeId: string) => void;
  onRerunTaskSource: (task: GenerationTask) => void;
  task: GenerationTask;
}) {
  const { t } = useTranslations("common");
  const mediaTypeLabelValue: Record<GenerationTask["mediaType"], string> = {
    audio: t('mediaTypeLabels.audio'),
    image: t('mediaTypeLabels.image'),
    transcript: t('mediaTypeLabels.transcript'),
    video: t('mediaTypeLabels.video'),
  };
  const sourceNode = task.source.boardNodeId
    ? nodes.find(node => node.id === task.source.boardNodeId)
    : undefined;
  const resultNode = sourceNode ? findResultNodeForSource(nodes, sourceNode.id) : undefined;
  const resultAssetId = task.activeResultAssetId ?? task.resultAssetIds.at(-1);
  const resultItem = resultAssetId
    ? items.find(item => item.id === resultAssetId && item.status === "complete")
    : undefined;
  const canFocusTaskResult = Boolean(resultAssetId && (resultItem || resultNode?.resultAssetIds.includes(resultAssetId)));
  const canCancel = task.status === "pending" || task.status === "processing";
  const canHandleFailure = task.status === "failed";
  const progress = task.status === "complete" || task.status === "canceled" ? 100 : task.progress;
  const title = taskTitle(task, sourceNode);

  return (
    <article className="board-task-row rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2" data-status={task.status}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)]">
            {mediaIcon(task)}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <BoardStatusIcon status={task.status} />
              <h3 className="truncate text-xs font-semibold text-[var(--iw-text)]" title={title}>
                {title}
              </h3>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="board-task-meta-pill shrink-0 rounded-md border border-[var(--iw-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--iw-muted)]">
                {mediaTypeLabelValue[task.mediaType]}
              </span>
              <span className="truncate font-mono text-[10px] text-[var(--iw-faint)]" title={task.model}>
                {task.model}
              </span>
            </div>
          </div>
        </div>
        <BoardStatusBadge status={task.status} />
      </div>

      <div className="mt-2">
        <BoardTaskProgressBar progress={progress} status={task.status} />
      </div>

      {task.errorMessage ? (
        <p className="imagine-tone-surface mt-2 line-clamp-2 rounded-md border px-2 py-1 text-[10px] leading-4" data-tone="danger">
          {task.errorMessage}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <BoardTaskActionButton
          type="button"
          disabled={!sourceNode}
          className="nodrag"
          onClick={() => {
            if (sourceNode) onFocusNode(sourceNode.id);
          }}
        >
          <LocateFixed className="h-3 w-3" />
          {t('buttons.confirm', { fallback: "定位源" }) ?? "定位源"}
        </BoardTaskActionButton>
        <BoardTaskActionButton
          type="button"
          disabled={!canFocusTaskResult}
          className="nodrag"
          onClick={() => {
            if (canFocusTaskResult) onFocusTaskResult(task);
          }}
        >
          <CheckCircle2 className="h-3 w-3" />
          {t('statusLabels.complete', { fallback: "查看结果" }) ?? "查看结果"}
        </BoardTaskActionButton>
        {canCancel ? (
          <BoardTaskActionButton
            type="button"
            disabled={!sourceNode || canceling}
            className="nodrag"
            onClick={() => onCancelTask(task)}
            tone="danger"
          >
            {canceling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            {t('buttons.cancelTask')}
          </BoardTaskActionButton>
        ) : null}
        {canHandleFailure ? (
          <>
            <BoardTaskActionButton
              type="button"
              disabled={!sourceNode}
              className="nodrag"
              onClick={() => onRerunTaskSource(task)}
            >
              <RotateCcw className="h-3 w-3" />
              重跑源
            </BoardTaskActionButton>
            <BoardTaskActionButton
              type="button"
              className="nodrag"
              onClick={() => onDismissTask(task)}
              tone="danger"
            >
              <Trash2 className="h-3 w-3" />
              忽略
            </BoardTaskActionButton>
          </>
        ) : null}
      </div>
    </article>
  );
}

function TaskSection({
  cancelingTaskIds,
  items,
  nodes,
  onCancelTask,
  onDismissTask,
  onFocusTaskResult,
  onFocusNode,
  onRerunTaskSource,
  tasks,
  title,
}: {
  cancelingTaskIds: readonly string[];
  items: StorageItem[];
  nodes: BoardNode[];
  onCancelTask: (task: GenerationTask) => void;
  onDismissTask: (task: GenerationTask) => void;
  onFocusTaskResult: (task: GenerationTask) => void;
  onFocusNode: (nodeId: string) => void;
  onRerunTaskSource: (task: GenerationTask) => void;
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
          items={items}
          nodes={nodes}
          onCancelTask={onCancelTask}
          onDismissTask={onDismissTask}
          onFocusTaskResult={onFocusTaskResult}
          onFocusNode={onFocusNode}
          onRerunTaskSource={onRerunTaskSource}
          task={task}
        />
      ))}
    </section>
  );
}

export default function BoardTaskQueuePanel({
  cancelingTaskIds = [],
  items,
  nodes,
  onCancelTask,
  onDismissTask,
  onFocusTaskResult,
  onFocusNode,
  onRerunTaskSource,
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
        <BoardStatusBadge status="processing" className="justify-center rounded-lg py-1.5 text-center">
          运行 {activeTasks.length}
        </BoardStatusBadge>
        <BoardStatusBadge status="failed" className="justify-center rounded-lg py-1.5 text-center">
          失败 {failedTasks.length}
        </BoardStatusBadge>
        <BoardStatusBadge status="pending" className="justify-center rounded-lg py-1.5 text-center">
          需关注 {badgeCount}
        </BoardStatusBadge>
      </div>
      <TaskSection
        cancelingTaskIds={cancelingTaskIds}
        items={items}
        nodes={nodes}
        onCancelTask={onCancelTask}
        onDismissTask={onDismissTask}
        onFocusTaskResult={onFocusTaskResult}
        onFocusNode={onFocusNode}
        onRerunTaskSource={onRerunTaskSource}
        tasks={activeTasks}
        title="运行中"
      />
      <TaskSection
        cancelingTaskIds={cancelingTaskIds}
        items={items}
        nodes={nodes}
        onCancelTask={onCancelTask}
        onDismissTask={onDismissTask}
        onFocusTaskResult={onFocusTaskResult}
        onFocusNode={onFocusNode}
        onRerunTaskSource={onRerunTaskSource}
        tasks={failedTasks}
        title="需要处理"
      />
      <TaskSection
        cancelingTaskIds={cancelingTaskIds}
        items={items}
        nodes={nodes}
        onCancelTask={onCancelTask}
        onDismissTask={onDismissTask}
        onFocusTaskResult={onFocusTaskResult}
        onFocusNode={onFocusNode}
        onRerunTaskSource={onRerunTaskSource}
        tasks={recentTasks}
        title="最近完成"
      />
    </div>
  );
}
