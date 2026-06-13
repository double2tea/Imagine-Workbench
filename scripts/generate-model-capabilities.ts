import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import modelCapabilityCatalogJson from "../lib/providers/catalog/data/model-capabilities.json";
import {
  generateModelCapabilityCatalog,
  isRunningHubStandardCatalogEntry,
} from "../lib/providers/catalog/runninghub-standard-generator";
import type { ModelCapabilityCatalogDocument } from "../lib/providers/model-catalog";

const CATALOG_PATH = resolve("lib/providers/catalog/data/model-capabilities.json");

function main(): void {
  const check = process.argv.includes("--check");
  const catalog = modelCapabilityCatalogJson as ModelCapabilityCatalogDocument;
  const generated = generateModelCapabilityCatalog(catalog);
  const text = `${JSON.stringify(generated, null, 2)}\n`;

  if (check) {
    const current = readFileSync(CATALOG_PATH, "utf8");
    if (current !== text) {
      throw new Error("model-capabilities.json is stale. Run pnpm run generate:model-capabilities.");
    }
    assertHandAuthoredEntriesPreserved(catalog, generated);
    return;
  }

  writeFileSync(CATALOG_PATH, text);
}

function assertHandAuthoredEntriesPreserved(
  before: ModelCapabilityCatalogDocument,
  after: ModelCapabilityCatalogDocument,
): void {
  const beforeHandAuthored = before.entries.filter(entry => !isRunningHubStandardCatalogEntry(entry));
  const afterHandAuthored = after.entries.filter(entry => !isRunningHubStandardCatalogEntry(entry));
  if (JSON.stringify(beforeHandAuthored) !== JSON.stringify(afterHandAuthored)) {
    throw new Error("RunningHub catalog generation changed hand-authored non-RunningHub entries");
  }
}

main();
