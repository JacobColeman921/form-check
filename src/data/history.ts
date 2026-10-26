import type { CoachResult, MovementId } from "../domain/coach";

export interface SavedSession {
  id: string;
  movement: MovementId;
  createdAt: string;
  result: CoachResult;
  stills: string[];
}

const DB_NAME = "form-check-local";
const STORE = "sessions";
const MAX_SESSIONS = 60;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("Local history is unavailable in this browser.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open local history."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let value: T;
    let settled = false;
    const done = (v: T) => { value = v; settled = true; };
    tx.oncomplete = () => { db.close(); if (settled) resolve(value); else reject(new Error("History operation returned no result.")); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Local history failed.")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Local history was interrupted.")); };
    fn(store, done, reject);
  });
}

export async function listSessions(): Promise<SavedSession[]> {
  return transact("readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as SavedSession[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error ?? new Error("Could not read local history."));
  });
}

export async function saveSession(result: CoachResult): Promise<SavedSession> {
  const record: SavedSession = { id: crypto.randomUUID(), movement: result.movement, createdAt: new Date().toISOString(), result, stills: [] };
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save the session."));
  });
  // Keep local history small. An old session can be removed after the new one
  // is safely committed, so a quota or database error never loses the new set.
  const all = await listSessions();
  const old = all.slice(MAX_SESSIONS);
  if (old.length) await transact<void>("readwrite", (store, resolve) => {
    old.forEach((item) => store.delete(item.id));
    resolve();
  });
  return record;
}

export async function saveStills(record: SavedSession, stills: string[]): Promise<SavedSession> {
  const next = { ...record, stills: stills.slice(0, 2) };
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(next);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save the stills."));
  });
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete the session."));
  });
}
