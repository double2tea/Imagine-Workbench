import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const distDir = process.argv[2] ?? ".next";
const manifest = JSON.parse(await readFile(path.join(distDir, "app-build-manifest.json"), "utf8"));
const budgets = new Map([
  ["/", { entries: ["/layout", "/page"], maxBytes: 600 * 1024 }],
  ["/board", { entries: ["/layout", "/board/layout", "/board/page"], maxBytes: 650 * 1024 }],
]);

for (const [route, budget] of budgets) {
  const files = new Set(budget.entries.flatMap(entry => manifest.pages?.[entry] ?? []).filter(file => file.endsWith(".js")));
  if (files.size === 0) throw new Error(`Bundle budget could not find production assets for ${route}`);
  let totalBytes = 0;
  for (const file of files) totalBytes += gzipSync(await readFile(path.join(distDir, file))).byteLength;
  const kib = (totalBytes / 1024).toFixed(1);
  const maxKib = (budget.maxBytes / 1024).toFixed(0);
  console.log(`${route} initial JavaScript (gzip): ${kib} KiB / ${maxKib} KiB`);
  if (totalBytes > budget.maxBytes) throw new Error(`${route} exceeds its initial JavaScript budget`);
}
