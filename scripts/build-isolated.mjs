import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const protectedFiles = ["next-env.d.ts", "tsconfig.json"];
const originals = new Map(await Promise.all(protectedFiles.map(async file => [file, await readFile(file)])));
let buildCode;
try {
  buildCode = await run("pnpm", ["exec", "next", "build"], { ...process.env, NEXT_DIST_DIR: ".next-production" });
} finally {
  await Promise.all([...originals].map(([file, contents]) => writeFile(file, contents)));
}
if (buildCode !== 0) process.exit(buildCode);
process.exitCode = await run(process.execPath, ["scripts/check-bundle-budget.mjs", ".next-production"], process.env);

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
}
