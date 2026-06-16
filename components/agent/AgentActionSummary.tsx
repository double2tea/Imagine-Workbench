import type { AgentToolAction } from "@/lib/agent-actions";
import { useTranslations } from "@/lib/i18n";

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
  const { t } = useTranslations("agent");
  const params = action.params ?? {};
  const lines: string[] = [];

  if (action.type === "create_board_note") {
    pushLine(lines, t("actionSummary.titleLabel"), params.title);
    pushLine(lines, t("actionSummary.contentLabel"), params.body ?? params.prompt);
  } else if (action.type === "apply_board_patch") {
    const patch = params.boardPatch;
    pushLine(lines, t("actionSummary.titleLabel"), patch?.title);
    lines.push(t("actionSummary.operationCount", { count: patch?.operations.length ?? 0 }));
    if (patch?.shots?.length) lines.push(t("actionSummary.shotCount", { count: patch.shots.length }));
    lines.push(`${t("actionSummary.autoRunLabel")}: ${patch?.run ? t("actionSummary.autoRunYes") : t("actionSummary.autoRunNo")}`);
  } else if (action.type === "update_board_node") {
    pushLine(lines, t("actionSummary.targetNodeLabel"), params.nodeId || t("actionSummary.currentNodeFallback"));
    pushLine(lines, t("actionSummary.contentLabel"), params.prompt ?? params.instruction ?? params.body);
    pushLine(lines, t("actionSummary.modelLabel"), params.model);
    pushLine(lines, t("actionSummary.ratioLabel"), params.aspectRatio);
    pushLine(lines, t("actionSummary.resolutionLabel"), params.imageResolution ?? params.videoResolution);
    pushLine(lines, t("actionSummary.qualityLabel"), params.imageQuality);
    pushLine(lines, t("actionSummary.durationLabel"), params.videoDuration);
    pushLine(lines, t("actionSummary.presetLabel"), params.videoPreset);
    pushLine(lines, t("actionSummary.referenceModeLabel"), params.videoReferenceMode);
  } else if (action.type === "continue_image_to_video") {
    pushLine(lines, t("actionSummary.sourceNodeLabel"), params.nodeId || t("actionSummary.currentNodeFallback"));
    pushLine(lines, t("actionSummary.videoPromptLabel"), params.prompt);
    pushLine(lines, t("actionSummary.modelLabel"), params.model);
    pushLine(lines, t("actionSummary.ratioLabel"), params.aspectRatio);
    pushLine(lines, t("actionSummary.resolutionLabel"), params.videoResolution);
    pushLine(lines, t("actionSummary.durationLabel"), params.videoDuration);
    pushLine(lines, t("actionSummary.presetLabel"), params.videoPreset);
    pushLine(lines, t("actionSummary.referenceModeLabel"), params.videoReferenceMode);
    lines.push(`${t("actionSummary.autoRunLabel")}: ${params.run ? t("actionSummary.autoRunYes") : t("actionSummary.autoRunNo")}`);
  } else {
    if (params.prompt) lines.push(`${t("actionSummary.promptLabel")}: ${truncateText(params.prompt, 96)}`);
    pushLine(lines, t("actionSummary.modelLabel"), params.model);
    pushLine(lines, t("actionSummary.ratioLabel"), params.aspectRatio);
    pushLine(lines, t("actionSummary.resolutionLabel"), params.imageResolution ?? params.videoResolution);
    pushLine(lines, t("actionSummary.qualityLabel"), params.imageQuality);
    pushLine(lines, t("actionSummary.durationLabel"), params.videoDuration);
    pushLine(lines, t("actionSummary.presetLabel"), params.videoPreset);
    pushLine(lines, t("actionSummary.referenceModeLabel"), params.videoReferenceMode);
  }

  if (lines.length === 0) {
    return <p className="imagine-agent-action-muted text-[11px]">{t("actionSummary.noParamSummary")}</p>;
  }

  return (
    <ul className="imagine-agent-action-summary">
      {lines.map(line => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
