import os from "node:os";
import path from "node:path";
import { LOCAL_DATABASE_STORAGE_ADAPTER } from "../local-storage-targets";

export const DEFAULT_LOCAL_WORKSPACE_SEGMENTS = [".imagine-workbench", "workspaces", "default"] as const;
export const LOCAL_WORKSPACE_EXPORTS_DIR = "exports";
export const LOCAL_WORKSPACE_TRASH_DIR = "trash";

export interface LocalWorkspacePaths {
  assetDir: string;
  databaseFile: string;
  exportDir: string;
  previewDir: string;
  rootDir: string;
  trashDir: string;
}

export interface ResolveLocalWorkspacePathsOptions {
  homeDir?: string;
  workspaceDir?: string;
}

export interface LocalWorkspacePathPlan {
  assetDirectoryName: string;
  databaseFileName: string;
  exportDirectoryName: string;
  previewDirectoryName: string;
  trashDirectoryName: string;
}

export function getLocalWorkspacePathPlan(): LocalWorkspacePathPlan {
  const localDatabase = LOCAL_DATABASE_STORAGE_ADAPTER.localDatabase;
  if (!localDatabase) throw new Error("Local database storage adapter is missing local database config");
  return {
    assetDirectoryName: localDatabase.assetDirectoryName,
    databaseFileName: localDatabase.databaseFileName,
    exportDirectoryName: LOCAL_WORKSPACE_EXPORTS_DIR,
    previewDirectoryName: localDatabase.previewDirectoryName,
    trashDirectoryName: LOCAL_WORKSPACE_TRASH_DIR,
  };
}

export function resolveLocalWorkspaceRoot(options: ResolveLocalWorkspacePathsOptions = {}): string {
  const workspaceDir = options.workspaceDir?.trim();
  if (workspaceDir) return resolveUserPath(workspaceDir, options.homeDir ?? os.homedir());
  return path.join(options.homeDir ?? os.homedir(), ...DEFAULT_LOCAL_WORKSPACE_SEGMENTS);
}

export function resolveLocalWorkspacePaths(options: ResolveLocalWorkspacePathsOptions = {}): LocalWorkspacePaths {
  const rootDir = resolveLocalWorkspaceRoot(options);
  const pathPlan = getLocalWorkspacePathPlan();
  return {
    assetDir: path.join(rootDir, pathPlan.assetDirectoryName),
    databaseFile: path.join(rootDir, pathPlan.databaseFileName),
    exportDir: path.join(rootDir, pathPlan.exportDirectoryName),
    previewDir: path.join(rootDir, pathPlan.previewDirectoryName),
    rootDir,
    trashDir: path.join(rootDir, pathPlan.trashDirectoryName),
  };
}

function resolveUserPath(input: string, homeDir: string): string {
  if (input === "~") return homeDir;
  if (input.startsWith("~/")) return path.join(homeDir, input.slice(2));
  return path.resolve(input);
}
