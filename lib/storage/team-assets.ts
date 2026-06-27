import { API_ROUTES } from "@/lib/api/routes";
import { ApiError } from "@/lib/api/errors";
import type { StorageItem, StorageItemMeta, StorageItemType } from "@/lib/db";
import { dataUriToBlob, parseDataUri } from "@/lib/providers/utils";
import type {
  PublicTeamAssetPayload,
  PublicTeamAssetRecord,
  TeamAssetListResult,
  TeamAssetMutationResult,
} from "@/lib/storage/team-asset-types";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceAssetListOptions } from "@/lib/storage/repository";
import type { WorkspaceAssetPayloadRef } from "@/lib/storage/schema";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";

export interface TeamAssetSaveInput {
  item: StorageItem;
}

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

export async function saveTeamAsset(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamAssetSaveInput,
): Promise<TeamAssetMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const dataUriPayload = readAssetDataUriPayload(input.item);
  const existing = dataUriPayload ? null : await context.repository.assets.get(input.item.id);
  const payload = dataUriPayload
    ? await context.repository.payloads.write({
      assetId: input.item.id,
      blob: dataUriPayload.blob,
      mimeType: dataUriPayload.mimeType,
    })
    : existing?.payload;
  if (!payload) {
    throw new ApiError(400, "invalid_team_asset_request", "Team asset payload is required");
  }
  const meta = teamAssetMetaFromItem(input.item, payload);
  await context.repository.assets.put({ meta, payload });
  return {
    asset: publicTeamAssetRecord({ meta, payload }),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export function publicTeamAssetRecord(record: {
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

function readAssetDataUriPayload(item: StorageItem): { blob: Blob; mimeType: string } | null {
  if (!item.url.startsWith("data:")) return null;
  let mimeType: string;
  try {
    mimeType = parseDataUri(item.url).mimeType;
  } catch {
    throw new ApiError(400, "invalid_team_asset_request", "Team asset URL must be a base64 data URI");
  }
  if (!isSupportedAssetMime(item.type, mimeType)) {
    throw new ApiError(400, "invalid_team_asset_request", "Team asset MIME type is unsupported");
  }
  try {
    return {
      blob: dataUriToBlob(item.url),
      mimeType,
    };
  } catch {
    throw new ApiError(400, "invalid_team_asset_request", "Team asset URL must be a base64 data URI");
  }
}

function teamAssetMetaFromItem(item: StorageItem, payload: WorkspaceAssetPayloadRef): StorageItemMeta {
  const { url: _url, ...meta } = item;
  return {
    ...meta,
    contentHash: payload.contentHash,
    hasBlob: true,
    url: undefined,
  };
}

function isSupportedAssetMime(type: StorageItemType, mimeType: string): boolean {
  if (type === "image") {
    return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/gif";
  }
  if (type === "video") {
    return mimeType === "video/mp4" || mimeType === "video/webm" || mimeType === "video/quicktime";
  }
  if (type === "audio") {
    return mimeType === "audio/mpeg" || mimeType === "audio/wav" || mimeType === "audio/ogg" || mimeType === "audio/mp4";
  }
  return mimeType === "text/plain";
}
