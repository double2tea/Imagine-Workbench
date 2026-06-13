import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function fail(message) {
  console.error(`App version check failed: ${message}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  fail("package.json must define a non-empty version string.");
}

const appVersionSource = readFileSync(join(root, "lib/app-version.ts"), "utf8");
const nextConfigSource = readFileSync(join(root, "next.config.ts"), "utf8");
const brandSource = readFileSync(join(root, "components/workbench/WorkspaceTopBarBrand.tsx"), "utf8");

if (!appVersionSource.includes("process.env.NEXT_PUBLIC_APP_VERSION")) {
  fail("lib/app-version.ts must read NEXT_PUBLIC_APP_VERSION.");
}

if (!nextConfigSource.includes("NEXT_PUBLIC_APP_VERSION: packageJson.version")) {
  fail("next.config.ts must derive NEXT_PUBLIC_APP_VERSION from package.json.");
}

if (!brandSource.includes("version = APP_VERSION")) {
  fail("WorkspaceTopBarBrand must default to APP_VERSION.");
}

console.log(`App version check passed: ${packageJson.version}`);
