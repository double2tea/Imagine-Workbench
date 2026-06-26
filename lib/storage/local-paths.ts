import os from "node:os";
import path from "node:path";
import { POSTGRES_STORAGE_ADAPTER } from "../local-storage-targets";

export const DEFAULT_LOCAL_WORKSPACE_SEGMENTS = [".imagine-workbench", "workspaces", "default"] as const;
export const LOCAL_WORKSPACE_EXPORTS_DIR = "exports";
export const LOCAL_WORKSPACE_TRASH_DIR = "trash";

export interface LocalWorkspacePaths {
  assetDir: string;
  exportDir: string;
  mediaDir: string;
  previewDir: string;
  rootDir: string;
  trashDir: string;
}

export interface ResolveLocalWorkspacePathsOptions {
  homeDir?: string;
  workspaceDir?: string;
}

export interface LocalWorkspacePathPlan {
  exportDirectoryName: string;
  payloadDirectoryName: string;
  previewDirectoryName: string;
  trashDirectoryName: string;
}

export function getLocalWorkspacePathPlan(): LocalWorkspacePathPlan {
  const postgres = POSTGRES_STORAGE_ADAPTER.postgres;
  if (!postgres) throw new Error("PostgreSQL storage adapter is missing PostgreSQL config");
  return {
    exportDirectoryName: LOCAL_WORKSPACE_EXPORTS_DIR,
    payloadDirectoryName: postgres.payloadDirectoryName,
    previewDirectoryName: postgres.previewDirectoryName,
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
    assetDir: path.join(rootDir, pathPlan.payloadDirectoryName),
    exportDir: path.join(rootDir, pathPlan.exportDirectoryName),
    mediaDir: rootDir,
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
