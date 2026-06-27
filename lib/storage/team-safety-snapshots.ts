import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceSafetySnapshotRecord } from "@/lib/storage/schema";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type {
  PublicTeamSafetySnapshot,
  TeamSafetySnapshotResult,
} from "@/lib/storage/team-safety-snapshot-types";

export interface TeamSafetySnapshotSaveInput {
  snapshot: WorkspaceSafetySnapshotRecord;
}

export async function getLatestTeamSafetySnapshot(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamSafetySnapshotResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const snapshot = await context.repository.safetySnapshots.getLatest();
  return {
    snapshot: snapshot ? toPublicTeamSafetySnapshot(snapshot) : null,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamSafetySnapshot(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamSafetySnapshotSaveInput,
): Promise<TeamSafetySnapshotResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  await context.queryable.query("begin");
  try {
    await context.repository.safetySnapshots.put(input.snapshot);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "safety_snapshot.save",
      metadata: {
        assetCount: input.snapshot.assetCount,
        boardCount: input.snapshot.boardCount,
        id: input.snapshot.id,
        reason: input.snapshot.reason,
        sizeBytes: input.snapshot.sizeBytes,
      },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
  return {
    snapshot: toPublicTeamSafetySnapshot(input.snapshot),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

function toPublicTeamSafetySnapshot(snapshot: WorkspaceSafetySnapshotRecord): PublicTeamSafetySnapshot {
  return {
    assetCount: snapshot.assetCount,
    boardCount: snapshot.boardCount,
    createdAt: snapshot.createdAt,
    fileName: snapshot.fileName,
    generationTaskCount: snapshot.generationTaskCount,
    id: snapshot.id,
    libraryAssetCount: snapshot.libraryAssetCount,
    origin: snapshot.origin,
    reason: snapshot.reason,
    settingsKeyCount: snapshot.settingsKeyCount,
    sizeBytes: snapshot.sizeBytes,
    voiceProfileCount: snapshot.voiceProfileCount,
  };
}
