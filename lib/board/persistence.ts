import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import type { BoardNode } from "@/lib/board/types";

const DB_NAME = "ImagineWorkbenchBoardDB";
const STORE_NAME = "boards";
const SUMMARY_STORE = "board_summaries";
const DB_VERSION = 2;

function openBoardDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
        db.createObjectStore(SUMMARY_STORE, { keyPath: "id" });
      }

      if (event.oldVersion > 0 && event.oldVersion < DB_VERSION && db.objectStoreNames.contains(STORE_NAME)) {
        const boards = transaction.objectStore(STORE_NAME);
        const summaries = transaction.objectStore(SUMMARY_STORE);
        const cursorRequest = boards.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const board = cursor.value as BoardDocument;
          summaries.put(toBoardSummaryRecord(board));
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function toBoardSummaryRecord(board: BoardDocument): BoardSummary {
  return {
    id: board.id,
    title: board.title,
    nodeCount: Array.isArray(board.nodes) ? board.nodes.length : 0,
    updatedAt: board.updatedAt,
    createdAt: board.createdAt,
  };
}

function readStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openBoardDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

function readSummaryStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openBoardDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(SUMMARY_STORE, mode);
        const request = action(transaction.objectStore(SUMMARY_STORE));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

function writeBoardAndSummary(board: BoardDocument): Promise<void> {
  return openBoardDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SUMMARY_STORE], "readwrite");
        transaction.objectStore(STORE_NAME).put(board);
        transaction.objectStore(SUMMARY_STORE).put(toBoardSummaryRecord(board));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB write failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB write aborted"));
      }),
  );
}

function migrateBoardDocument(doc: BoardDocument): BoardDocument {
  const hasLegacyAsset = doc.nodes.some(
    node => node.kind === "asset" && "resultSourceNodeId" in node && (node as unknown as Record<string, unknown>).resultSourceNodeId,
  );
  const hasLegacyGenerate = doc.nodes.some(
    node =>
      (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app") &&
      ("resultAssetId" in node || "resultAssetIds" in node),
  );
  if (!hasLegacyAsset && !hasLegacyGenerate) return doc;

  const migratedNodes: BoardNode[] = [];
  for (const node of doc.nodes) {
    if (node.kind === "asset") {
      const legacyNode = node as typeof node & { resultSourceNodeId?: string; resultStackKey?: string; resultAssetIds?: string[] };
      if (legacyNode.resultSourceNodeId) {
        // Convert the asset node into a result node — same ID, same position, same edges
        const { resultSourceNodeId: _, resultStackKey: __, resultAssetIds: ___, ...baseNode } = legacyNode;
        migratedNodes.push({
          ...baseNode,
          kind: "result",
          sourceNodeId: legacyNode.resultSourceNodeId,
          resultStackKey: legacyNode.resultStackKey ?? "",
          activeAssetId: baseNode.asset.assetId,
          resultAssetIds: legacyNode.resultAssetIds ?? [baseNode.asset.assetId],
        });
        continue;
      }
    }
    if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app") {
      const { resultAssetId: _ra, resultAssetIds: _ras, ...rest } = node as typeof node & { resultAssetId?: unknown; resultAssetIds?: unknown };
      migratedNodes.push(rest as typeof node);
      continue;
    }
    migratedNodes.push(node);
  }

  // Edges remain unchanged — the converted result node keeps the same ID
  return { ...doc, nodes: migratedNodes, updatedAt: new Date().toISOString() };
}

export async function getBoardFromDB(id: string): Promise<BoardDocument | null> {
  const result = await readStore<BoardDocument | undefined>("readonly", (store) => store.get(id));
  return result ? migrateBoardDocument(result) : null;
}

export async function saveBoardToDB(board: BoardDocument): Promise<void> {
  await writeBoardAndSummary(board);
}

export async function listBoardsFromDB(): Promise<BoardDocument[]> {
  const boards = await readStore<BoardDocument[]>("readonly", (store) => store.getAll());
  return boards.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function listBoardSummariesFromDB(): Promise<BoardSummary[]> {
  const summaries = await readSummaryStore<BoardSummary[]>("readonly", (store) => store.getAll());
  return summaries.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function deleteBoardFromDB(id: string): Promise<void> {
  await openBoardDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SUMMARY_STORE], "readwrite");
        transaction.objectStore(STORE_NAME).delete(id);
        transaction.objectStore(SUMMARY_STORE).delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
      }),
  );
}

export async function clearBoardsFromDB(): Promise<void> {
  await openBoardDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME, SUMMARY_STORE], "readwrite");
        transaction.objectStore(STORE_NAME).clear();
        transaction.objectStore(SUMMARY_STORE).clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
      }),
  );
}
