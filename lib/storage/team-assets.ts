import { API_ROUTES } from "@/lib/api/routes";
import { ApiError } from "@/lib/api/errors";
import type { StorageItemMeta } from "@/lib/db";
import type { PublicTeamAssetPayload, PublicTeamAssetRecord, TeamAssetListResult } from "@/lib/storage/team-asset-types";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceAssetListOptions } from "@/lib/storage/repository";
import type { WorkspaceAssetPayloadRef } from "@/lib/storage/schema";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";

export async function listTeamAssets(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: WorkspaceAssetListOptions,
): Promise<TeamAssetListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const assets = await context.repository.assets.list(options);
  return {
    assets: assets.map(record => publicTeamAssetRecord(record)),
    limit: options.limit ?? 200,
    offset: options.offset ?? 0,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamAsset(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  assetId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const record = await context.repository.assets.get(assetId);
  if (!record) throw new ApiError(404, "team_asset_not_found", "Team asset was not found");
  await context.repository.assets.delete(assetId);
}

function publicTeamAssetRecord(record: {
  meta: StorageItemMeta;
  payload?: WorkspaceAssetPayloadRef;
  preview?: WorkspaceAssetPayloadRef;
}): PublicTeamAssetRecord {
  return {
    downloadUrl: record.payload ? API_ROUTES.storage.teamAssetMedia(record.meta.id, { download: true }) : undefined,
    mediaUrl: record.payload ? API_ROUTES.storage.teamAssetMedia(record.meta.id) : undefined,
    meta: record.meta,
    payload: record.payload ? publicPayload(record.payload) : undefined,
    preview: record.preview ? publicPayload(record.preview) : undefined,
  };
}

function publicPayload(ref: WorkspaceAssetPayloadRef): PublicTeamAssetPayload {
  return {
    contentHash: ref.contentHash,
    kind: ref.kind,
    mimeType: ref.mimeType,
    sizeBytes: ref.sizeBytes,
  };
}
