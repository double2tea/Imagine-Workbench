import type { WorkspaceExportResult } from "@/lib/workspace-backup-format";

export interface TeamWorkspaceBackupExport extends WorkspaceExportResult {
  body: ArrayBuffer;
  targetKind: "postgres";
  workspaceId: string;
}
