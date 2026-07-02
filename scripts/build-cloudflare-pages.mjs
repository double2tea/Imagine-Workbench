import { spawn } from "node:child_process";
import { access, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const nodeRuntimeRoutePattern = /export\s+const\s+runtime\s*=\s*["']nodejs["']/;
const staleDisabledRouteFiles = await findDisabledRouteFiles("app");
if (staleDisabledRouteFiles.length > 0) {
  console.log(`Restoring ${staleDisabledRouteFiles.length} previously disabled Cloudflare route files...`);
  for (const disabledRouteFilePath of staleDisabledRouteFiles) {
    const routeFilePath = enabledRoutePath(disabledRouteFilePath);
    if (await pathExists(routeFilePath)) {
      throw new Error(`Cannot restore ${disabledRouteFilePath}: ${routeFilePath} already exists`);
    }
    await rename(disabledRouteFilePath, routeFilePath);
  }
}
const nodeRuntimeRouteFiles = await findNodeRuntimeRouteFiles("app");
const localOnlyRouteFiles = nodeRuntimeRouteFiles;
const movedRoutes = [];
let restoring = false;

function disabledRoutePath(routeFilePath) {
  return `${routeFilePath}.cloudflare-disabled`;
}

function enabledRoutePath(routeFilePath) {
  return routeFilePath.replace(/\.cloudflare-disabled$/, "");
}

async function findNodeRuntimeRouteFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const routeFiles = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      routeFiles.push(...(await findNodeRuntimeRouteFiles(entryPath)));
      continue;
    }
    if (entry.name !== "route.ts") continue;
    const source = await readFile(entryPath, "utf8");
    if (nodeRuntimeRoutePattern.test(source)) routeFiles.push(entryPath);
  }
  return routeFiles;
}

async function findDisabledRouteFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const routeFiles = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      routeFiles.push(...(await findDisabledRouteFiles(entryPath)));
      continue;
    }
    if (entry.name === "route.ts.cloudflare-disabled") routeFiles.push(entryPath);
  }
  return routeFiles;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 1));
  });
}

async function moveRoutesOut() {
  console.log(`Preparing Cloudflare Pages build routes (${localOnlyRouteFiles.length} Node runtime routes hidden)...`);
  for (const routeFilePath of localOnlyRouteFiles) {
    await rename(routeFilePath, disabledRoutePath(routeFilePath));
    movedRoutes.push(routeFilePath);
  }
}

async function restoreRoutes() {
  if (restoring) return;
  restoring = true;
  if (movedRoutes.length === 0) return;
  console.log("Restoring local-only routes...");
  for (let index = movedRoutes.length - 1; index >= 0; index -= 1) {
    const routeFilePath = movedRoutes[index];
    await rename(disabledRoutePath(routeFilePath), routeFilePath);
  }
}

async function exitAfterRestore(signal) {
  await restoreRoutes();
  process.kill(process.pid, signal);
}

process.once("SIGINT", () => {
  void exitAfterRestore("SIGINT");
});
process.once("SIGTERM", () => {
  void exitAfterRestore("SIGTERM");
});

console.log("Cleaning generated Cloudflare Pages outputs...");
await rm(path.join(".next", "types"), { force: true, recursive: true });
await rm(path.join(".vercel", "output"), { force: true, recursive: true });

try {
  await moveRoutesOut();
  console.log("Running @cloudflare/next-on-pages...");
  const exitCode = await run("pnpm", ["dlx", "@cloudflare/next-on-pages@1"], {
    ...process.env,
    ENABLE_EXPERIMENTAL_COREPACK: "1",
    VERCEL: "0",
  });
  process.exitCode = exitCode;
} finally {
  await restoreRoutes();
}
