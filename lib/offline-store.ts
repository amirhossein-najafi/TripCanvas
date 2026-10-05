import type { TripBundle } from "@/types";
import { dropChange, queueChange, type QueuedChange } from "@/lib/sync";

const DB_NAME = "tripcanvas-offline";
const DB_VERSION = 1;

export type StoredOp = QueuedChange & {
  method: string;
  args: unknown[];
};

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("bundles")) db.createObjectStore("bundles");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheBundle(bundle: TripBundle) {
  try {
    const db = await openDb();
    const tx = db.transaction("bundles", "readwrite");
    tx.objectStore("bundles").put(bundle, bundle.trip.id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Offline cache is a bonus when IndexedDB is blocked.
  }
}

export async function readCachedBundle(tripId: string): Promise<TripBundle | null> {
  try {
    const db = await openDb();
    const tx = db.transaction("bundles", "readonly");
    const bundle = await requestToPromise(tx.objectStore("bundles").get(tripId));
    db.close();
    return (bundle as TripBundle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function readQueue(): Promise<StoredOp[]> {
  try {
    const db = await openDb();
    const tx = db.transaction("queue", "readonly");
    const raw = await requestToPromise(tx.objectStore("queue").get("ops"));
    db.close();
    return (raw as StoredOp[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function writeQueue(ops: StoredOp[]) {
  const db = await openDb();
  const tx = db.transaction("queue", "readwrite");
  tx.objectStore("queue").put(ops, "ops");
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function enqueueOp(op: StoredOp) {
  const current = await readQueue();
  await writeQueue(queueChange(current, op));
}

export async function removeOp(id: string) {
  const current = await readQueue();
  await writeQueue(dropChange(current, id));
}
