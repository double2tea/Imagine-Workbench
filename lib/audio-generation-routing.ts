import { parseProviderModel } from "./providers/model-catalog";
import type { RunningHubTaskNodeBinding } from "./providers/types";

export function isRunningHubWorkflowAudioTarget(
  model: string,
  _runningHubNodeInfoList?: RunningHubTaskNodeBinding[],
): boolean {
  const parsed = parseProviderModel(model, "12ai");
  return parsed.provider === "runninghub" && (
    parsed.model.startsWith("ai-app-audio:") ||
    parsed.model.startsWith("workflow-audio:")
  );
}
