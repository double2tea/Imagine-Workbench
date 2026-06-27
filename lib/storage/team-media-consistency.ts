import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface TeamMediaConsistencyRefs {
  payloadStorageKeys: string[];
  previewStorageKeys: string[];
}

export interface TeamMediaConsistencySummary {
  missingPayloadFiles: number;
  missingPreviewFiles: number;
  orphanedPayloadFiles: number;
  orphanedPreviewFiles: number;
  tmpFiles: number;
  trashFiles: number;
}

export interface TeamMediaConsistencyCleanupResult {
  deletedFiles: number;
  deletedOrphanedPayloadFiles: number;
  deletedOrphanedPreviewFiles: number;
  deletedTmpFiles: number;
  deletedTrashFiles: number;
}

interface TeamMediaConsistencyDetails {
  missingPayloadStorageKeys: string[];
  missingPreviewStorageKeys: string[];
  orphanedPayloadStorageKeys: string[];
  orphanedPreviewStorageKeys: string[];
  tmpStorageKeys: string[];
  trashStorageKeys: string[];
}

export async function inspectTeamMediaConsistency(
  mediaDir: string,
  refs: TeamMediaConsistencyRefs,
): Promise<TeamMediaConsistencySummary> {
  return summarizeTeamMediaConsistency(await collectTeamMediaConsistencyDetails(mediaDir, refs));
}

export function countTeamMediaConsistencyIssues(summary: TeamMediaConsistencySummary): number {
  return summary.missingPayloadFiles +
    summary.missingPreviewFiles +
    summary.orphanedPayloadFiles +
    summary.orphanedPreviewFiles +
    summary.tmpFiles +
    summary.trashFiles;
}

export async function cleanupTeamMediaMaintenanceFiles(
  mediaDir: string,
  refs: TeamMediaConsistencyRefs,
): Promise<TeamMediaConsistencyCleanupResult> {
  const details = await collectTeamMediaConsistencyDetails(mediaDir, refs);
  await deleteStorageKeys(mediaDir, [
    ...details.orphanedPayloadStorageKeys,
    ...details.orphanedPreviewStorageKeys,
    ...details.tmpStorageKeys,
    ...details.trashStorageKeys,
  ]);
  return {
    deletedFiles: details.orphanedPayloadStorageKeys.length +
      details.orphanedPreviewStorageKeys.length +
      details.tmpStorageKeys.length +
      details.trashStorageKeys.length,
    deletedOrphanedPayloadFiles: details.orphanedPayloadStorageKeys.length,
    deletedOrphanedPreviewFiles: details.orphanedPreviewStorageKeys.length,
    deletedTmpFiles: details.tmpStorageKeys.length,
    deletedTrashFiles: details.trashStorageKeys.length,
  };
}

async function collectTeamMediaConsistencyDetails(
  mediaDir: string,
  refs: TeamMediaConsistencyRefs,
): Promise<TeamMediaConsistencyDetails> {
  const payloadStorageKeys = new Set(refs.payloadStorageKeys);
  const previewStorageKeys = new Set(refs.previewStorageKeys);
  const [
    missingPayloadStorageKeys,
    missingPreviewStorageKeys,
    originalFiles,
    previewFiles,
    tmpStorageKeys,
    trashStorageKeys,
  ] = await Promise.all([
    listMissingStorageKeys(mediaDir, payloadStorageKeys),
    listMissingStorageKeys(mediaDir, previewStorageKeys),
    collectStorageKeysUnder(mediaDir, "originals"),
    collectStorageKeysUnder(mediaDir, "previews"),
    collectStorageKeysUnder(mediaDir, "tmp"),
    collectStorageKeysUnder(mediaDir, "trash"),
  ]);

  return {
    missingPayloadStorageKeys,
    missingPreviewStorageKeys,
    orphanedPayloadStorageKeys: originalFiles.filter(storageKey => !payloadStorageKeys.has(storageKey)),
    orphanedPreviewStorageKeys: previewFiles.filter(storageKey => !previewStorageKeys.has(storageKey)),
    tmpStorageKeys,
    trashStorageKeys,
  };
}

function summarizeTeamMediaConsistency(details: TeamMediaConsistencyDetails): TeamMediaConsistencySummary {
  return {
    missingPayloadFiles: details.missingPayloadStorageKeys.length,
    missingPreviewFiles: details.missingPreviewStorageKeys.length,
    orphanedPayloadFiles: details.orphanedPayloadStorageKeys.length,
    orphanedPreviewFiles: details.orphanedPreviewStorageKeys.length,
    tmpFiles: details.tmpStorageKeys.length,
    trashFiles: details.trashStorageKeys.length,
  };
}

async function listMissingStorageKeys(mediaDir: string, storageKeys: ReadonlySet<string>): Promise<string[]> {
  const missing: string[] = [];
  for (const storageKey of storageKeys) {
    if (!await storageKeyExists(mediaDir, storageKey)) missing.push(storageKey);
  }
  return missing;
}

async function storageKeyExists(mediaDir: string, storageKey: string): Promise<boolean> {
  try {
    const stats = await stat(resolveMediaStorageKey(mediaDir, storageKey));
    return stats.isFile();
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function collectStorageKeysUnder(mediaDir: string, relativeDir: "originals" | "previews" | "tmp" | "trash"): Promise<string[]> {
  const absoluteDir = resolveMediaStorageKey(mediaDir, relativeDir);
  return collectStorageKeys(mediaDir, absoluteDir);
}

async function collectStorageKeys(mediaDir: string, absoluteDir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await readdir(absoluteDir, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return [];
    throw error;
  }

  const storageKeys: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      storageKeys.push(...await collectStorageKeys(mediaDir, absolutePath));
    } else if (entry.isFile()) {
      storageKeys.push(relativeMediaStorageKey(mediaDir, absolutePath));
    }
  }
  return storageKeys;
}

async function deleteStorageKeys(mediaDir: string, storageKeys: string[]): Promise<void> {
  for (const storageKey of storageKeys) {
    await rm(resolveMediaStorageKey(mediaDir, storageKey), { force: true });
  }
}

function resolveMediaStorageKey(mediaDir: string, storageKey: string): string {
  if (path.isAbsolute(storageKey)) throw new Error("Invalid team media storage key");
  const parts = storageKey.split(/[\\/]+/);
  if (parts.includes("..") || parts.includes("")) throw new Error("Invalid team media storage key");
  const resolvedMediaDir = path.resolve(mediaDir);
  const resolved = path.resolve(resolvedMediaDir, ...parts);
  if (resolved !== resolvedMediaDir && !resolved.startsWith(`${resolvedMediaDir}${path.sep}`)) {
    throw new Error("Invalid team media storage key");
  }
  return resolved;
}

function relativeMediaStorageKey(mediaDir: string, absolutePath: string): string {
  return path.relative(path.resolve(mediaDir), absolutePath).split(path.sep).join(path.posix.sep);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
