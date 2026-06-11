import { spawn } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const disabledRoutesDir = path.join(".tmp", "cloudflare-pages-disabled-routes");
const localOnlyRoutes = [
  "app/api/resolve/commands",
  "app/api/resolve/provider-credentials",
];

function disabledRoutePath(routePath) {
  return path.join(disabledRoutesDir, routePath.replaceAll("/", "__"));
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 1));
  });
}

async function moveRoutesOut() {
  await rm(disabledRoutesDir, { force: true, recursive: true });
  await mkdir(disabledRoutesDir, { recursive: true });
  for (const routePath of localOnlyRoutes) {
    await rename(routePath, disabledRoutePath(routePath));
  }
}

async function restoreRoutes() {
  for (const routePath of localOnlyRoutes) {
    await rename(disabledRoutePath(routePath), routePath);
  }
  await rm(disabledRoutesDir, { force: true, recursive: true });
}

await rm(".next", { force: true, recursive: true });
await rm(path.join(".vercel", "output"), { force: true, recursive: true });
await moveRoutesOut();

try {
  const exitCode = await run("pnpm", ["dlx", "@cloudflare/next-on-pages@1"], {
    ...process.env,
    ENABLE_EXPERIMENTAL_COREPACK: "1",
  });
  process.exitCode = exitCode;
} finally {
  await restoreRoutes();
}
