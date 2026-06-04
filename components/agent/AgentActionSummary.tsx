import type { AgentToolAction } from "@/lib/agent-actions";

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function pushLine(lines: string[], label: string, value: string | undefined): void {
  if (!value?.trim()) return;
  lines.push(`${label}: ${value.trim()}`);
}

export function AgentActionSummary({ action }: { action: AgentToolAction }) {
  const params = action.params ?? {};
  const lines: string[] = [];

  if (action.type === "create_board_note") {
    pushLine(lines, "标题", params.title);
    pushLine(lines, "内容", params.body ?? params.prompt);
  } else if (action.type === "apply_board_patch") {
    const patch = params.boardPatch;
    pushLine(lines, "标题", patch?.title);
    lines.push(`操作数: ${patch?.operations.length ?? 0}`);
    if (patch?.shots?.length) lines.push(`分镜数: ${patch.shots.length}`);
    lines.push(`自动运行: ${patch?.run ? "是" : "否"}`);
  } else if (action.type === "update_board_node") {
    pushLine(lines, "目标节点", params.nodeId || "当前选中节点");
    pushLine(lines, "内容", params.prompt ?? params.instruction ?? params.body);
    pushLine(lines, "模型", params.model);
    pushLine(lines, "比例", params.aspectRatio);
    pushLine(lines, "分辨率", params.imageResolution ?? params.videoResolution);
    pushLine(lines, "质量", params.imageQuality);
    pushLine(lines, "时长", params.videoDuration);
    pushLine(lines, "预设", params.videoPreset);
    pushLine(lines, "参考模式", params.videoReferenceMode);
  } else if (action.type === "continue_image_to_video") {
    pushLine(lines, "来源节点", params.nodeId || "当前选中节点");
    pushLine(lines, "视频提示词", params.prompt);
    pushLine(lines, "模型", params.model);
    pushLine(lines, "比例", params.aspectRatio);
    pushLine(lines, "分辨率", params.videoResolution);
    pushLine(lines, "时长", params.videoDuration);
    pushLine(lines, "预设", params.videoPreset);
    pushLine(lines, "参考模式", params.videoReferenceMode);
    lines.push(`自动运行: ${params.run ? "是" : "否"}`);
  } else {
    if (params.prompt) lines.push(`提示词: ${truncateText(params.prompt, 96)}`);
    pushLine(lines, "模型", params.model);
    pushLine(lines, "比例", params.aspectRatio);
    pushLine(lines, "分辨率", params.imageResolution ?? params.videoResolution);
    pushLine(lines, "质量", params.imageQuality);
    pushLine(lines, "时长", params.videoDuration);
    pushLine(lines, "预设", params.videoPreset);
    pushLine(lines, "参考模式", params.videoReferenceMode);
  }

  if (lines.length === 0) {
    return <p className="imagine-agent-action-muted text-[11px]">无参数摘要</p>;
  }

  return (
    <ul className="imagine-agent-action-summary">
      {lines.map(line => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
