import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import WorkspaceStorageModeBadge from "../components/workbench/WorkspaceStorageModeBadge";

test("workspace storage mode badge renders the active IndexedDB mode", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceStorageModeBadge, {
    label: "IndexedDB",
    target: "indexeddb",
    title: "Current storage mode: IndexedDB",
  }));

  assert.match(html, /data-storage-target="indexeddb"/);
  assert.match(html, /IndexedDB/);
  assert.match(html, /Current storage mode: IndexedDB/);
});

test("workspace storage mode badge renders the active PostgreSQL mode", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceStorageModeBadge, {
    label: "PostgreSQL",
    target: "postgres",
    title: "Current storage mode: PostgreSQL",
  }));

  assert.match(html, /data-storage-target="postgres"/);
  assert.match(html, /PostgreSQL/);
  assert.match(html, /Current storage mode: PostgreSQL/);
});
