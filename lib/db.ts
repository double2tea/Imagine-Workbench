// IndexedDB dynamic helper to store large base64 images and video assets
const DB_NAME = "ImagineWorkbenchDB";
const STORE_NAME = "assets";
const DB_VERSION = 1;

export interface StorageItem {
  id: string;
  type: "image" | "video";
  url: string; // Base64 data or Picsum url
  prompt: string;
  model: string;
  aspectRatio: string;
  createdAt: string;
  status: "complete" | "processing" | "pending" | "failed";
  progress: number;
  operationName?: string;
  errorMessage?: string;
  generationRequest?: GenerationRequestSnapshot;
  maskOriginalId?: string; // If this was created by drawing on another image
}

export interface GenerationRequestSnapshot {
  prompt: string;
  model: string;
  aspectRatio: string;
  imageSize?: string;
  thinkingLevel?: string;
  videoDurationSeconds?: string;
  videoPreset?: string;
  videoResolution?: string;
  referenceImages?: string[];
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Save or Update item
export async function saveToDB(item: StorageItem): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(item);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB save failed"));
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB save aborted"));
  });
}

// Retrieve all items
export async function getAllFromDB(): Promise<StorageItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by dates descending
      const sorted = (request.result as StorageItem[]).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      resolve(sorted);
    };
    request.onerror = () => reject(request.error);
  });
}

// Delete item
export async function deleteFromDB(id: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB Delete Failed:", err);
  }
}

// Clear Database store
export async function clearAllDB(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB Clear Failed:", err);
  }
}
