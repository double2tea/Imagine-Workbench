import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readSource(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

test("workspace asset saves choose either PostgreSQL or IndexedDB without dual writes", () => {
  const source = readSource("app/page.tsx");

  assert.match(
    source,
    /const saveWorkspaceAssetDirect = useCallback[\s\S]*?if \(workspaceStorageTarget === "postgres"\) {\s*return saveTeamAsset\(item, requireTeamCsrfToken\(\)\);\s*}\s*await saveToDB\(item\);/,
  );
  assert.match(
    source,
    /const saveWorkspaceAssetWithPreview = useCallback[\s\S]*?if \(workspaceStorageTarget === "postgres"\) {\s*return saveTeamAsset\(item, requireTeamCsrfToken\(\)\);\s*}\s*return saveItemWithPreview\(item\);/,
  );
});

test("workspace reloads read shared PostgreSQL gallery data when team mode is active", () => {
  const source = readSource("app/page.tsx");

  assert.match(
    source,
    /if \(workspaceStorageTarget === "postgres"\) {\s*const teamItems = await fetchTeamWorkspaceGalleryItems\(\);\s*if \(isActive\) setItems\(teamItems\);\s*return;\s*}\s*const metas = await listWorkspaceGalleryMetas\(\);/,
  );
  assert.match(
    source,
    /const reloadWorkspaceAssets = useCallback[\s\S]*?if \(workspaceStorageTarget === "postgres"\) {\s*setItems\(await fetchTeamWorkspaceGalleryItems\(\)\);\s*return;\s*}\s*const metas = await listWorkspaceGalleryMetas\(\);/,
  );
});

test("board asset store reads team assets instead of hydrating IndexedDB in PostgreSQL mode", () => {
  const source = readSource("hooks/useBoardAssetStore.ts");

  assert.match(
    source,
    /if \(storageTarget === "postgres"\) {\s*const scoped = await loadTeamBoardAssetItems\(boardId, referencedAssetIds\);[\s\S]*?setItems\(scoped\.items\);[\s\S]*?return;\s*}\s*const scopedMetas = await listBoardScopedAssetMetas\(boardId, referencedAssetIds, boardNodeIds\);/,
  );
});
