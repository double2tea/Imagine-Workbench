import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const distDirName = process.env.NEXT_DIST_DIR ?? ".next";
if (path.isAbsolute(distDirName) || distDirName.includes("..")) throw new Error("NEXT_DIST_DIR must be a project-relative directory");
const distDir = path.join(root, distDirName);
const standalone = path.join(distDir, "standalone");
const server = path.join(standalone, "server.js");
await access(server).catch(() => {
  throw new Error("Standalone build not found. Run pnpm build before pnpm start.");
});

await mkdir(path.join(standalone, distDirName), { recursive: true });
await cp(path.join(distDir, "static"), path.join(standalone, distDirName, "static"), { force: true, recursive: true });
await cp(path.join(root, "public"), path.join(standalone, "public"), { force: true, recursive: true });

const child = spawn(process.execPath, [server], {
  cwd: standalone,
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.once("error", error => {
  throw error;
});
child.once("exit", code => {
  process.exitCode = code ?? 1;
});
