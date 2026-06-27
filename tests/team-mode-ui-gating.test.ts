import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readSource(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

test("data management team auth controls stay inside the PostgreSQL storage-mode branch", () => {
  const source = readSource("components/settings/DataManagementWorkspace.tsx");
  const postgresBranchStart = source.indexOf("{isTeamStorageMode ? (");
  const postgresBranchProofEnd = source.indexOf('t("dataManagement.browserMigrationPreview")');

  assert.ok(postgresBranchStart >= 0);
  assert.ok(postgresBranchProofEnd > postgresBranchStart);

  for (const key of [
    't("dataManagement.teamSession")',
    't("dataManagement.teamLogin")',
    't("dataManagement.teamBootstrap")',
    't("dataManagement.teamBootstrapOwner")',
  ]) {
    const first = source.indexOf(key);
    assert.equal(first, source.lastIndexOf(key));
    assert.ok(first > postgresBranchStart);
    assert.ok(first < postgresBranchProofEnd);
  }
});

test("settings refresh only fetches team session after PostgreSQL runtime status", () => {
  const source = readSource("components/settings/SettingsModal.tsx");
  const refreshStatusStart = source.indexOf("const refreshStorageStatus = useCallback(async () => {");
  const refreshTeamSessionStart = source.indexOf("const refreshTeamSession = useCallback(async () => {");
  const postgresModeCheck = source.indexOf('if (status.mode === "postgres") {', refreshStatusStart);
  const teamSessionFetch = source.indexOf("const session = await fetchTeamSession();", refreshStatusStart);

  assert.ok(refreshStatusStart >= 0);
  assert.ok(refreshTeamSessionStart > refreshStatusStart);
  assert.ok(postgresModeCheck > refreshStatusStart);
  assert.ok(teamSessionFetch > postgresModeCheck);
  assert.ok(teamSessionFetch < refreshTeamSessionStart);
});
