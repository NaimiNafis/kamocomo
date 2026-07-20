import localforage from 'localforage';

/**
 * Offline resilience (Phase 9 / §8 decision #7): cache the last good result of
 * each read so a flaky-signal or airplane-mode reload can show cached content
 * with a stale banner instead of an error or a white screen.
 */
const store = localforage.createInstance({ name: 'virtual-kamogawa', storeName: 'cache' });

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    return await store.getItem<T>(key);
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await store.setItem(key, value);
  } catch {
    /* cache is best-effort; storage full/unavailable is non-fatal */
  }
}

export interface CachedResult<T> {
  data: T;
  stale: boolean; // true when served from cache after a failed/offline fetch
}

const FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Fetches fresh data and caches it; on failure/offline/timeout, falls back to
 * the cached copy (marked stale). Rethrows only when there's no cache to fall
 * back to. The timeout matters on flaky outdoor signal (§8 decision #7), where
 * a Supabase request can hang indefinitely rather than rejecting, and the
 * navigator.onLine short-circuit skips a hanging request entirely when the
 * device already knows it's offline.
 */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  if (!navigator.onLine) {
    const cached = await readCache<T>(key);
    if (cached !== null) return { data: cached, stale: true };
  }
  try {
    const data = await withTimeout(fetcher(), FETCH_TIMEOUT_MS);
    void writeCache(key, data);
    return { data, stale: false };
  } catch (err) {
    const cached = await readCache<T>(key);
    if (cached !== null) return { data: cached, stale: true };
    throw err;
  }
}
