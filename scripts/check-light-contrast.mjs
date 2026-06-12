import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const commandName = process.env.npm_lifecycle_event === "check:light-contrast"
  ? "Light contrast"
  : "Theme color";
const targetDirs = ["app", "components", "lib"];
const targetExtensions = new Set([".css", ".ts", ".tsx"]);
const highRiskPattern =
  /\b(?:text-(?:amber|yellow|emerald|green|red|rose|blue|sky|cyan|teal|violet|purple|fuchsia|indigo|orange|lime)-(?:100|200|300|400)|bg-(?:amber|yellow|emerald|green|red|rose|blue|sky|cyan|teal|violet|purple|fuchsia|indigo|orange|lime)-500\/(?:8|10|12|15|18|20)|bg-(?:amber|yellow|emerald|green|red|rose|blue|sky|cyan|teal|violet|purple|fuchsia|indigo|orange|lime)-950)\b/;

const intentionalOverlayFiles = new Set([
  "components/assets/FullscreenPreview.tsx",
  "components/panorama/PanoramaOverlay.tsx",
  "components/CanvasMaskEditor.tsx",
]);

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listFiles(path));
      continue;
    }
    if (targetExtensions.has(extensionOf(path))) files.push(path);
  }
  return files;
}

function isCovered(line, file) {
  if (line.includes("imagine-tone-") || line.includes("data-tone=") || line.includes("imagine-operation-tone-")) return true;
  if (file === "app/globals.css") return true;
  if (intentionalOverlayFiles.has(file)) return true;
  if (
    line.includes("imagine-asset-media") ||
    line.includes("imagine-asset-type-badge") ||
    line.includes("imagine-generation-stage") ||
    line.includes("board-media-node-shell") ||
    line.includes("bg-black/") ||
    line.includes("text-white")
  ) return true;
  return false;
}

const findings = [];

for (const dir of targetDirs) {
  for (const path of listFiles(join(root, dir))) {
    const file = relative(root, path);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!highRiskPattern.test(line)) return;
      if (isCovered(line, file)) return;
      findings.push({ file, line: index + 1, text: line.trim() });
    });
  }
}

if (findings.length === 0) {
  console.log(`${commandName} scan passed: no tracked high-risk theme color classes.`);
  process.exit(0);
}

console.log(`${commandName} scan tracked ${findings.length} legacy high-risk class lines:`);
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} ${finding.text}`);
}

if (strict) {
  console.error("Strict mode failed: replace tracked classes with imagine-tone-* utilities or add an intentional media-overlay exemption.");
  process.exit(1);
}
