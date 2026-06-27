import type { WorkspaceDataSummary } from "@/lib/data-management";

export interface TeamWorkspaceDataSummaryResult {
  summary: WorkspaceDataSummary;
  targetKind: "postgres";
  workspaceId: string;
}
