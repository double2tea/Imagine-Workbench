import { ApiError } from "@/lib/api/errors";
import type { LibraryAssetRecord } from "@/lib/db";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceStoragePageOptions } from "@/lib/storage/repository";
import { publicTeamAssetRecord } from "@/lib/storage/team-assets";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type {
  PublicTeamAssetLibraryEntry,
  TeamAssetLibraryListResult,
  TeamAssetLibraryMutationResult,
} from "@/lib/storage/team-asset-library-types";

export interface TeamAssetLibrarySaveInput {
  record: LibraryAssetRecord;
}

export async function listTeamAssetLibrary(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: WorkspaceStoragePageOptions,
): Promise<TeamAssetLibraryListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const records = await context.repository.assetLibrary.list(options);
  return {
    entries: await Promise.all(records.map(async record => publicTeamAssetLibraryEntry(context.repository, record.record))),
    limit: options.limit ?? 200,
    offset: options.offset ?? 0,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamAssetLibraryRecord(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamAssetLibrarySaveInput,
): Promise<TeamAssetLibraryMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const asset = await context.repository.assets.get(input.record.assetId);
  if (!asset) throw new ApiError(404, "team_asset_not_found", "Team library asset was not found");
  await context.repository.assetLibrary.put({ record: input.record });
  return {
    entry: await publicTeamAssetLibraryEntry(context.repository, input.record),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamAssetLibraryRecord(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  itemId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const record = await context.repository.assetLibrary.get(itemId);
  if (!record) throw new ApiError(404, "team_asset_library_not_found", "Team library item was not found");
  const asset = await context.repository.assets.get(record.record.assetId);
  if (asset?.meta.libraryItemId === itemId) {
    await context.repository.assets.delete(record.record.assetId);
    return;
  }
  await context.repository.assetLibrary.delete(itemId);
}

async function publicTeamAssetLibraryEntry(
  repository: Awaited<ReturnType<typeof createTeamWorkspaceStorageContext>>["repository"],
  record: LibraryAssetRecord,
): Promise<PublicTeamAssetLibraryEntry> {
  const asset = await repository.assets.get(record.assetId);
  return {
    asset: asset ? publicTeamAssetRecord(asset) : null,
    record,
  };
}
