import assert from "node:assert/strict";
import test from "node:test";

import {
  claimNextResolveCommand,
  createResolveCommand,
  finishResolveCommand,
  getResolveCommand,
  pruneResolveCommands,
  resetResolveCommandsForTest,
} from "../lib/api/resolve-commands";

test("Resolve commands can be created claimed and completed", () => {
  resetResolveCommandsForTest();

  const created = createResolveCommand({ kind: "doctor" });
  assert.equal(created.status, "pending");

  const claimed = claimNextResolveCommand();
  assert.equal(claimed?.id, created.id);
  assert.equal(claimed?.status, "running");

  const completed = finishResolveCommand({ id: created.id, status: "complete", result: "Resolve connected" });
  assert.equal(completed.status, "complete");
  assert.equal(completed.result, "Resolve connected");
  assert.equal(getResolveCommand(created.id)?.status, "complete");
  assert.equal(claimNextResolveCommand(), null);
});

test("Resolve commands reject unknown command kinds", () => {
  resetResolveCommandsForTest();

  assert.throws(() => createResolveCommand({ kind: "import" }), /kind must be doctor/);
});

test("Resolve commands store explicit errors", () => {
  resetResolveCommandsForTest();

  const created = createResolveCommand({ kind: "doctor" });
  const failed = finishResolveCommand({ id: created.id, status: "error", error: "Resolve closed" });
  assert.equal(failed.status, "error");
  assert.equal(failed.error, "Resolve closed");
});

test("Resolve commands prune stale active commands before claim", () => {
  resetResolveCommandsForTest();

  const created = createResolveCommand({ kind: "doctor" });
  pruneResolveCommands(Date.parse(created.createdAt) + 91_000);

  assert.equal(getResolveCommand(created.id), null);
  assert.equal(claimNextResolveCommand(), null);
});

test("Resolve commands keep completed commands briefly for polling", () => {
  resetResolveCommandsForTest();

  const created = createResolveCommand({ kind: "doctor" });
  const completed = finishResolveCommand({ id: created.id, status: "complete", result: "ok" });
  pruneResolveCommands(Date.parse(completed.completedAt ?? "") + 299_000);

  assert.equal(getResolveCommand(created.id)?.status, "complete");
  pruneResolveCommands(Date.parse(completed.completedAt ?? "") + 301_000);
  assert.equal(getResolveCommand(created.id), null);
});
