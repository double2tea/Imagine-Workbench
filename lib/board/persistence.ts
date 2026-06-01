import type { BoardDocument } from "@/lib/board/types";

const DB_NAME = "ImagineWorkbenchBoardDB";
const STORE_NAME = "boards";
const DB_VERSION = 1;

function openBoardDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
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

function writeStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<void> {
  return openBoardDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));

        transaction.oncomplete = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB transaction aborted"));
      }),
  );
}

export async function getBoardFromDB(id: string): Promise<BoardDocument | null> {
  const result = await readStore<BoardDocument | undefined>("readonly", (store) => store.get(id));
  return result ?? null;
}

export async function saveBoardToDB(board: BoardDocument): Promise<void> {
  await writeStore("readwrite", (store) => store.put(board));
}

export async function deleteBoardFromDB(id: string): Promise<void> {
  await writeStore("readwrite", (store) => store.delete(id));
}
