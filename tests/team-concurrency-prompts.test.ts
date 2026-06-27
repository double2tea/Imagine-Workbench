import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("team board and settings conflicts surface reload or merge prompts", () => {
  const boardAdapter = readFileSync("lib/board/storage-adapter.ts", "utf8");
  const boardState = readFileSync("hooks/useBoardState.ts", "utf8");
  const providerSettings = readFileSync("hooks/useProviderSettings.ts", "utf8");
  const zhBoard = readFileSync("messages/zh/board.json", "utf8");
  const enBoard = readFileSync("messages/en/board.json", "utf8");
  const zhCommon = readFileSync("messages/zh/common.json", "utf8");
  const enCommon = readFileSync("messages/en/common.json", "utf8");

  assert.match(boardAdapter, /team_board_version_conflict/);
  assert.match(boardAdapter, /board\.workspace\.versionConflict/);
  assert.match(boardState, /boardStorageErrorMessage/);
  assert.match(boardState, /t\(error\.message\)/);
  assert.match(zhBoard, /"versionConflict": ".*刷新.*合并/);
  assert.match(enBoard, /"versionConflict": ".*Reload.*merge/);

  assert.match(providerSettings, /TeamStorageClientError/);
  assert.match(providerSettings, /team_setting_version_conflict/);
  assert.match(providerSettings, /team_setting_version_required/);
  assert.match(providerSettings, /common\.notices\.providerSettingConflict/);
  assert.match(zhCommon, /"providerSettingConflict": ".*刷新.*合并/);
  assert.match(enCommon, /"providerSettingConflict": ".*Reload.*merge/);
});
