import type { ParsedPlaylist } from "./m3u-parser";

/**
 * IndexedDB cache for the parsed playlist.
 *
 * Why: the M3U is typically multi-MB and the parser walks it line by line.
 * On a low-RAM device like a Chromecast / Fire TV browser, a cold start can
 * take 10-30 s and sometimes runs out of memory mid-parse. Caching the
 * already-parsed object means subsequent loads paint the catalog instantly,
 * and a fresh refresh happens silently in the background.
 *
 * Storage limits: IndexedDB on browsers allows hundreds of MB (vs 5-10 MB
 * for localStorage), more than enough for any reasonable IPTV playlist.
 *
 * Structured clone handles our object shape (records of arrays of plain
 * objects) natively — no JSON.stringify dance needed.
 */

const DB_NAME = "tristan-iptv";
const DB_VERSION = 1;
const STORE = "playlist";

export type CachedPlaylist = {
  playlist: ParsedPlaylist;
  timestamp: number;
  m3uUrl: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Retrieve a cached playlist by its source URL. Returns null on miss / error. */
export async function getCachedPlaylist(
  m3uUrl: string
): Promise<CachedPlaylist | null> {
  try {
    const db = await openDb();
    return await new Promise<CachedPlaylist | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(m3uUrl);
      req.onsuccess = () => {
        const value = req.result as CachedPlaylist | undefined;
        resolve(value ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Persist a parsed playlist for future cold starts. */
export async function setCachedPlaylist(
  m3uUrl: string,
  playlist: ParsedPlaylist
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const entry: CachedPlaylist = {
        playlist,
        timestamp: Date.now(),
        m3uUrl,
      };
      tx.objectStore(STORE).put(entry, m3uUrl);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // best-effort, never throw
      tx.onabort = () => resolve();
    });
  } catch {
    // Cache is best-effort — failure is silent
  }
}

/** Drop a single entry (used when the user manually wants a hard refresh). */
export async function clearCachedPlaylist(m3uUrl?: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      if (m3uUrl) tx.objectStore(STORE).delete(m3uUrl);
      else tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

/** Pretty-print "il y a 5 min" / "il y a 2 h" — used in toasts. */
export function formatCacheAge(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "il y a quelques secondes";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}
