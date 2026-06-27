import { spawn } from "node:child_process";
import { readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const nodeRuntimeRoutePattern = /export\s+const\s+runtime\s*=\s*["']nodejs["']/;
const localOnlyRouteFiles = await findNodeRuntimeRouteFiles("app");
const movedRoutes = [];

function disabledRoutePath(routeFilePath) {
  return `${routeFilePath}.cloudflare-disabled`;
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
  console.log("Restoring local-only routes...");
  for (let index = movedRoutes.length - 1; index >= 0; index -= 1) {
    const routeFilePath = movedRoutes[index];
    await rename(disabledRoutePath(routeFilePath), routeFilePath);
  }
}

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
