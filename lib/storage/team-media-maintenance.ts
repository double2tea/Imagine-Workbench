import type { QueryResultRow } from "pg";
import { badRequest } from "@/lib/api/errors";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import {
  cleanupTeamMediaMaintenanceFiles,
  listMissingTeamMediaStorageKeys,
  type TeamMediaConsistencyRefs,
} from "@/lib/storage/team-media-consistency";
import {
  isTeamMediaMaintenanceTarget,
  type TeamMediaMaintenanceCleanupResult,
  type TeamMediaMaintenanceTarget,
} from "@/lib/storage/team-media-maintenance-types";

interface PayloadStorageKeyRow extends QueryResultRow {
  asset_id: string;
  storage_key: string;
  storage_kind: string;
}

interface PreviewStorageKeyRow extends QueryResultRow {
  asset_id: string;
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
  if (target === "missing-payload-assets") {
    await context.queryable.query("begin");
    try {
      const deletedMissingPayloadAssets = await deleteMissingPayloadAssets(
        context.queryable,
        config.mediaDir,
        context.session.workspaceId,
        assetId => context.repository.assets.delete(assetId),
      );
      await recordTeamAuditEvent(context.queryable, {
        eventType: "team_media.cleanup",
        metadata: {
          deletedMissingPayloadAssets,
          target,
        },
        userId: context.session.userId,
        workspaceId: context.session.workspaceId,
      });
      await context.queryable.query("commit");
      return {
        deletedFiles: 0,
        deletedMissingPayloadAssets,
        deletedMissingPreviewRefs: 0,
        deletedOrphanedPayloadFiles: 0,
        deletedOrphanedPreviewFiles: 0,
        deletedTmpFiles: 0,
        deletedTrashFiles: 0,
        target,
        targetKind: "postgres",
        workspaceId: context.session.workspaceId,
      };
    } catch (error) {
      await context.queryable.query("rollback");
      throw error;
    }
  }
  if (target === "missing-preview-refs") {
    await context.queryable.query("begin");
    try {
      const deletedMissingPreviewRefs = await deleteMissingPreviewRefs(
        context.queryable,
        config.mediaDir,
        context.session.workspaceId,
      );
      await recordTeamAuditEvent(context.queryable, {
        eventType: "team_media.cleanup",
        metadata: {
          deletedMissingPreviewRefs,
          target,
        },
        userId: context.session.userId,
        workspaceId: context.session.workspaceId,
      });
      await context.queryable.query("commit");
      return {
        deletedFiles: 0,
        deletedMissingPayloadAssets: 0,
        deletedMissingPreviewRefs,
        deletedOrphanedPayloadFiles: 0,
        deletedOrphanedPreviewFiles: 0,
        deletedTmpFiles: 0,
        deletedTrashFiles: 0,
        target,
        targetKind: "postgres",
        workspaceId: context.session.workspaceId,
      };
    } catch (error) {
      await context.queryable.query("rollback");
      throw error;
    }
  }

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
    deletedMissingPayloadAssets: 0,
    deletedMissingPreviewRefs: 0,
    target,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

async function deleteMissingPreviewRefs(
  queryable: PostgresQueryable,
  mediaDir: string,
  workspaceId: string,
): Promise<number> {
  const previews = await readTeamPreviewStorageKeyRows(queryable, workspaceId);
  const localPreviews = previews.filter(row => row.storage_kind === "local-file" && row.storage_key);
  const missingStorageKeys = new Set(await listMissingTeamMediaStorageKeys(
    mediaDir,
    localPreviews.map(row => row.storage_key ?? ""),
  ));
  const missingAssetIds = [...new Set(
    localPreviews
      .filter(row => row.storage_key && missingStorageKeys.has(row.storage_key))
      .map(row => row.asset_id),
  )];
  for (const assetId of missingAssetIds) {
    await queryable.query(
      `delete from asset_previews
       using assets
       where asset_previews.asset_id = assets.id
         and assets.workspace_id = $1
         and asset_previews.asset_id = $2`,
      [workspaceId, assetId],
    );
  }
  return missingAssetIds.length;
}

async function deleteMissingPayloadAssets(
  queryable: PostgresQueryable,
  mediaDir: string,
  workspaceId: string,
  deleteAsset: (assetId: string) => Promise<void>,
): Promise<number> {
  const payloads = await readTeamPayloadStorageKeyRows(queryable, workspaceId);
  const localPayloads = payloads.filter(row => row.storage_kind === "local-file");
  const missingStorageKeys = new Set(await listMissingTeamMediaStorageKeys(
    mediaDir,
    localPayloads.map(row => row.storage_key),
  ));
  const missingAssetIds = [...new Set(
    localPayloads
      .filter(row => missingStorageKeys.has(row.storage_key))
      .map(row => row.asset_id),
  )];
  for (const assetId of missingAssetIds) {
    await deleteAsset(assetId);
  }
  return missingAssetIds.length;
}

async function readTeamPreviewStorageKeyRows(
  queryable: PostgresQueryable,
  workspaceId: string,
): Promise<PreviewStorageKeyRow[]> {
  const result = await queryable.query<PreviewStorageKeyRow>(
    `select asset_previews.asset_id, asset_previews.storage_kind, asset_previews.storage_key
     from asset_previews
     inner join assets on assets.id = asset_previews.asset_id
     where assets.workspace_id = $1`,
    [workspaceId],
  );
  return result.rows;
}

async function readTeamPayloadStorageKeyRows(
  queryable: PostgresQueryable,
  workspaceId: string,
): Promise<PayloadStorageKeyRow[]> {
  const result = await queryable.query<PayloadStorageKeyRow>(
    `select assets.id as asset_id, asset_payloads.storage_kind, asset_payloads.storage_key
     from asset_payloads
     inner join assets on assets.id = asset_payloads.asset_id
     where assets.workspace_id = $1`,
    [workspaceId],
  );
  return result.rows;
}

async function readTeamMediaConsistencyRefs(
  queryable: PostgresQueryable,
  workspaceId: string,
): Promise<TeamMediaConsistencyRefs> {
  const [payloadsResult, previewsResult] = await Promise.all([
    queryable.query<PayloadStorageKeyRow>(
      `select assets.id as asset_id, asset_payloads.storage_kind, asset_payloads.storage_key
       from asset_payloads
       inner join assets on assets.id = asset_payloads.asset_id
       where assets.workspace_id = $1`,
      [workspaceId],
    ),
    queryable.query<PreviewStorageKeyRow>(
      `select asset_previews.asset_id, asset_previews.storage_kind, asset_previews.storage_key
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
