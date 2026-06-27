export const TEAM_MEDIA_MAINTENANCE_TARGETS = ["maintenance-files", "missing-payload-assets", "missing-preview-refs"] as const;

export type TeamMediaMaintenanceTarget = (typeof TEAM_MEDIA_MAINTENANCE_TARGETS)[number];

export interface TeamMediaMaintenanceCleanupResult {
  deletedFiles: number;
  deletedMissingPayloadAssets: number;
  deletedMissingPreviewRefs: number;
  deletedOrphanedPayloadFiles: number;
  deletedOrphanedPreviewFiles: number;
  deletedTmpFiles: number;
  deletedTrashFiles: number;
  target: TeamMediaMaintenanceTarget;
  targetKind: "postgres";
  workspaceId: string;
}

export function isTeamMediaMaintenanceTarget(value: unknown): value is TeamMediaMaintenanceTarget {
  return value === "maintenance-files" || value === "missing-payload-assets" || value === "missing-preview-refs";
}
