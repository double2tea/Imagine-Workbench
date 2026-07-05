import { spawn } from "node:child_process";
import { access, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const nodeRuntimeRoutePattern = /export\s+const\s+runtime\s*=\s*["']nodejs["']/;
const cloudflareByokHiddenRoutePatterns = [
  /^app\/api\/storage\/team\//,
  /^app\/api\/resolve\//,
];
const cloudflareByokHiddenRouteFiles = new Set([
  "app/api/agent/respond/route.ts",
  "app/api/board/prompt-text/route.ts",
  "app/api/chat/completions/route.ts",
  "app/api/image/edit/route.ts",
  "app/api/media/audio-download/route.ts",
  "app/api/media/cancel/route.ts",
  "app/api/media/generate-audio-workflow/route.ts",
  "app/api/media/generate-audio/route.ts",
  "app/api/media/generate-image/route.ts",
  "app/api/media/generate-video/route.ts",
  "app/api/media/image-download/route.ts",
  "app/api/media/status/route.ts",
  "app/api/media/video-download/route.ts",
  "app/api/models/route.ts",
  "app/api/prompts/optimize/route.ts",
  "app/api/runninghub/ai-app-schema/route.ts",
]);
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
const localOnlyRouteFiles = nodeRuntimeRouteFiles.filter(isCloudflareByokHiddenRouteFile);
const unsupportedNodeRuntimeRouteFiles = nodeRuntimeRouteFiles.filter(routeFilePath => !isCloudflareByokHiddenRouteFile(routeFilePath));
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

function normalizedSourcePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isCloudflareByokHiddenRouteFile(routeFilePath) {
  const normalizedPath = normalizedSourcePath(routeFilePath);
  return cloudflareByokHiddenRouteFiles.has(normalizedPath) ||
    cloudflareByokHiddenRoutePatterns.some(pattern => pattern.test(normalizedPath));
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
  if (unsupportedNodeRuntimeRouteFiles.length > 0) {
    throw new Error(
      [
        "Cloudflare Pages BYOK build blocked: unclassified Node runtime routes would be missing after deployment.",
        "Classify these routes as browser-BYOK-hidden routes or make them Edge-compatible:",
        ...unsupportedNodeRuntimeRouteFiles.map(routeFilePath => `- ${routeFilePath}`),
      ].join("\n"),
    );
  }
  console.log(`Preparing Cloudflare Pages BYOK build routes (${localOnlyRouteFiles.length} Node runtime routes hidden; browser BYOK enabled)...`);
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
    IMAGINE_CLOUDFLARE_PAGES_BUILD: "1",
    IMAGINE_BROWSER_BYOK: "1",
    NEXT_PUBLIC_IMAGINE_BROWSER_BYOK: "1",
    VERCEL: "0",
  });
  process.exitCode = exitCode;
} finally {
  await restoreRoutes();
}
