import type { QueryResultRow } from "pg";
import { badRequest } from "@/lib/api/errors";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import {
  cleanupTeamMediaMaintenanceFiles,
  type TeamMediaConsistencyRefs,
} from "@/lib/storage/team-media-consistency";
import {
  isTeamMediaMaintenanceTarget,
  type TeamMediaMaintenanceCleanupResult,
  type TeamMediaMaintenanceTarget,
} from "@/lib/storage/team-media-maintenance-types";

interface PayloadStorageKeyRow extends QueryResultRow {
  storage_key: string;
  storage_kind: string;
}

interface PreviewStorageKeyRow extends QueryResultRow {
  storage_key: string | null;
  storage_kind: string | null;
}

export async function cleanupTeamMediaMaintenance(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  target: TeamMediaMaintenanceTarget,
): Promise<TeamMediaMaintenanceCleanupResult> {
  if (!isTeamMediaMaintenanceTarget(target)) {
    throw badRequest("Invalid team media maintenance target", "invalid_team_media_maintenance_target");
  }
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const refs = await readTeamMediaConsistencyRefs(context.queryable, context.session.workspaceId);
  const cleanup = await cleanupTeamMediaMaintenanceFiles(config.mediaDir, refs);
  await recordTeamAuditEvent(context.queryable, {
    eventType: "team_media.cleanup",
    metadata: {
      deletedFiles: cleanup.deletedFiles,
      deletedOrphanedPayloadFiles: cleanup.deletedOrphanedPayloadFiles,
      deletedOrphanedPreviewFiles: cleanup.deletedOrphanedPreviewFiles,
      deletedTmpFiles: cleanup.deletedTmpFiles,
      deletedTrashFiles: cleanup.deletedTrashFiles,
      target,
    },
    userId: context.session.userId,
    workspaceId: context.session.workspaceId,
  });
  return {
    ...cleanup,
    target,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

async function readTeamMediaConsistencyRefs(
  queryable: PostgresQueryable,
  workspaceId: string,
): Promise<TeamMediaConsistencyRefs> {
  const [payloadsResult, previewsResult] = await Promise.all([
    queryable.query<PayloadStorageKeyRow>(
      `select asset_payloads.storage_kind, asset_payloads.storage_key
       from asset_payloads
       inner join assets on assets.id = asset_payloads.asset_id
       where assets.workspace_id = $1`,
      [workspaceId],
    ),
    queryable.query<PreviewStorageKeyRow>(
      `select asset_previews.storage_kind, asset_previews.storage_key
       from asset_previews
       inner join assets on assets.id = asset_previews.asset_id
       where assets.workspace_id = $1`,
      [workspaceId],
    ),
  ]);
  return {
    payloadStorageKeys: payloadsResult.rows
      .filter(row => row.storage_kind === "local-file")
      .map(row => row.storage_key),
    previewStorageKeys: previewsResult.rows
      .filter(row => row.storage_kind === "local-file" && row.storage_key)
      .map(row => row.storage_key ?? ""),
  };
}
