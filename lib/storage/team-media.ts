import { ApiError, requireApiText } from "@/lib/api/errors";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { createPostgresWorkspaceStorageRepository } from "@/lib/storage/postgres/repository";
import { assertTeamRole, requireTeamSession } from "@/lib/storage/team-auth";

export interface TeamAssetMediaResult {
  body: Blob;
  headers: Headers;
}

export interface TeamAssetMediaOptions {
  download: boolean;
}

export async function readTeamAssetMedia(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  assetIdInput: string,
  options: TeamAssetMediaOptions = { download: false },
): Promise<TeamAssetMediaResult> {
  const assetId = requireApiText(assetIdInput, "assetId");
  const session = await requireTeamSession(queryable, request);
  assertTeamRole(session, "viewer");

  const repository = createPostgresWorkspaceStorageRepository(queryable, config, session.workspaceId);
  const asset = await repository.assets.get(assetId);
  if (!asset) throw new ApiError(404, "asset_not_found", "Asset was not found");
  if (!asset.payload) throw new ApiError(404, "asset_payload_not_found", "Asset payload was not found");
  if (!asset.payload.mimeType) throw new ApiError(500, "asset_payload_mime_missing", "Asset payload MIME type is missing");

  const body = await repository.payloads.read(asset.payload);
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": asset.payload.mimeType,
    "X-Content-Type-Options": "nosniff",
  });
  if (options.download) {
    headers.set("Content-Disposition", `attachment; filename="${downloadFilenameFor(asset.meta.id, asset.payload.mimeType)}"`);
  }
  return { body, headers };
}

function downloadFilenameFor(assetId: string, mimeType: string): string {
  const safeId = assetId.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "asset";
  const extension = mediaFileExtensionFor(mimeType);
  return extension ? `${safeId}.${extension}` : safeId;
}

function mediaFileExtensionFor(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "text/plain") return "txt";
  return "";
}
