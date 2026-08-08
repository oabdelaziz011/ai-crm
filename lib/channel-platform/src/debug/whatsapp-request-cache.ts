/**
 * Server-only WhatsApp request-scoped cache (ALS).
 * Deduplicates company/channel/credentials/runtime/session/conversation loads
 * within a single inbound webhook request. Do not import from browser bundles.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type WhatsAppRequestCacheStageStats = {
  namespace: string;
  loads: number;
  hits: number;
  missDurationMs: number;
  savedMs: number;
  beforeMs: number;
  afterMs: number;
};

type CacheSlot<T> = {
  promise: Promise<T>;
  durationMs: number | null;
};

type NamespaceStats = {
  loads: number;
  hits: number;
  missDurationMs: number;
  savedMs: number;
};

const GLOBAL_KEY = "__WHATSAPP_REQUEST_CACHE__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_REQUEST_CACHE__";

const cacheAls = new AsyncLocalStorage<WhatsAppRequestCache>();

type SyncCacheSlot<T> = {
  value: T;
  constructMs: number;
};

export class WhatsAppRequestCache {
  readonly requestId: string;
  private readonly stores = new Map<string, Map<string, CacheSlot<unknown>>>();
  private readonly syncStores = new Map<string, Map<string, SyncCacheSlot<unknown>>>();
  private readonly stats = new Map<string, NamespaceStats>();

  constructor(requestId: string) {
    this.requestId = requestId;
  }

  /**
   * Synchronous get-or-create for factories (services, clients).
   * Construction runs once per namespace/key inside this request scope.
   */
  getOrCreateSync<T>(namespace: string, key: string, factory: () => T): T {
    let nsStore = this.syncStores.get(namespace);
    if (!nsStore) {
      nsStore = new Map();
      this.syncStores.set(namespace, nsStore);
    }

    const existing = nsStore.get(key) as SyncCacheSlot<T> | undefined;
    if (existing) {
      this.recordHit(namespace, existing.constructMs);
      return existing.value;
    }

    const startedAt = Date.now();
    const value = factory();
    const constructMs = Math.max(0, Date.now() - startedAt);
    nsStore.set(key, { value, constructMs });
    this.recordMiss(namespace, constructMs);
    return value;
  }

  async getOrLoad<T>(namespace: string, key: string, loader: () => Promise<T>): Promise<T> {
    let nsStore = this.stores.get(namespace);
    if (!nsStore) {
      nsStore = new Map();
      this.stores.set(namespace, nsStore);
    }

    const existing = nsStore.get(key) as CacheSlot<T> | undefined;
    if (existing) {
      const value = await existing.promise;
      this.recordHit(namespace, existing.durationMs ?? 0);
      return value;
    }

    const slot: CacheSlot<T> = {
      promise: null as unknown as Promise<T>,
      durationMs: null,
    };

    const startedAt = Date.now();
    slot.promise = (async () => {
      try {
        const value = await loader();
        slot.durationMs = Math.max(0, Date.now() - startedAt);
        this.recordMiss(namespace, slot.durationMs);
        return value;
      } catch (error) {
        nsStore!.delete(key);
        throw error;
      }
    })();

    nsStore.set(key, slot as CacheSlot<unknown>);
    return slot.promise;
  }

  /** Replace a cached value after a write (e.g. session touch). */
  set<T>(namespace: string, key: string, value: T): void {
    let nsStore = this.stores.get(namespace);
    if (!nsStore) {
      nsStore = new Map();
      this.stores.set(namespace, nsStore);
    }
    nsStore.set(key, {
      promise: Promise.resolve(value),
      durationMs: 0,
    });
  }

  /** Drop a cached key so the next load refreshes from the source of truth. */
  delete(namespace: string, key: string): void {
    this.stores.get(namespace)?.delete(key);
  }

  getStageStats(): WhatsAppRequestCacheStageStats[] {
    return [...this.stats.entries()]
      .map(([namespace, st]) => {
        const afterMs = st.missDurationMs * Math.max(1, st.loads);
        const beforeMs = afterMs + st.savedMs;
        return {
          namespace,
          loads: st.loads,
          hits: st.hits,
          missDurationMs: st.missDurationMs,
          savedMs: st.savedMs,
          beforeMs,
          afterMs,
        };
      })
      .sort((a, b) => b.savedMs - a.savedMs);
  }

  totalSavedMs(): number {
    return this.getStageStats().reduce((sum, stage) => sum + stage.savedMs, 0);
  }

  totalHits(): number {
    return this.getStageStats().reduce((sum, stage) => sum + stage.hits, 0);
  }

  totalMisses(): number {
    return this.getStageStats().reduce((sum, stage) => sum + stage.loads, 0);
  }

  /**
   * Print before/after comparison for duplicated-load optimization.
   * `afterWallClockMs` is the measured request wall clock with caching active.
   * `metaSendMs` (optional) is excluded so the 30% goal tracks server processing only.
   */
  printOptimizationReport(afterWallClockMs: number, metaSendMs = 0): void {
    const stages = this.getStageStats().filter((s) => s.loads > 0 || s.hits > 0);
    if (stages.length === 0) return;

    const savedMs = this.totalSavedMs();
    const safeMetaMs = Math.max(0, Math.min(metaSendMs, afterWallClockMs));
    const serverAfterMs = Math.max(0, afterWallClockMs - safeMetaMs);
    const serverBeforeMs = serverAfterMs + savedMs;
    const wallBeforeMs = afterWallClockMs + savedMs;
    const serverReductionPct =
      serverBeforeMs > 0 ? Math.round((savedMs / serverBeforeMs) * 1000) / 10 : 0;

    const lines = [
      "",
      "========== [WHATSAPP PERF - REQUEST CACHE] ==========",
      `requestId: ${this.requestId}`,
      "",
      "Before optimization (server processing, excl. Meta)",
      `${serverBeforeMs} ms`,
      "",
      "After optimization (server processing, excl. Meta)",
      `${serverAfterMs} ms`,
      "",
      "Estimated server reduction (duplicated loads)",
      `${savedMs} ms (${serverReductionPct}%)`,
      "",
      `Meta send API (unchanged): ${safeMetaMs} ms`,
      `Total wall before (est.): ${wallBeforeMs} ms`,
      `Total wall after: ${afterWallClockMs} ms`,
      "",
      "Per stage",
      "",
    ];

    for (const stage of stages) {
      lines.push(stage.namespace);
      lines.push(
        `loads=${stage.loads} hits=${stage.hits} miss=${stage.missDurationMs}ms saved=${stage.savedMs}ms`,
      );
      lines.push(`before: ${stage.beforeMs} ms`);
      lines.push(`after: ${stage.afterMs} ms`);
      lines.push("");
    }

    lines.push("================================================");
    lines.push("");
    console.log(lines.join("\n"));
  }

  private ensureStats(namespace: string): NamespaceStats {
    let st = this.stats.get(namespace);
    if (!st) {
      st = { loads: 0, hits: 0, missDurationMs: 0, savedMs: 0 };
      this.stats.set(namespace, st);
    }
    return st;
  }

  private recordMiss(namespace: string, durationMs: number): void {
    const st = this.ensureStats(namespace);
    st.loads += 1;
    if (st.loads === 1 || st.missDurationMs === 0) {
      st.missDurationMs = durationMs;
    } else {
      // Average miss duration across distinct keys in the namespace.
      st.missDurationMs = Math.round((st.missDurationMs * (st.loads - 1) + durationMs) / st.loads);
    }
  }

  private recordHit(namespace: string, avoidedMs: number): void {
    const st = this.ensureStats(namespace);
    st.hits += 1;
    st.savedMs += Math.max(0, avoidedMs);
  }
}

type GlobalCacheHost = typeof globalThis & {
  [GLOBAL_KEY]?: WhatsAppRequestCache | null;
  [GLOBAL_GETTER_KEY]?: () => WhatsAppRequestCache | null;
};

export function getWhatsAppRequestCache(): WhatsAppRequestCache | null {
  return cacheAls.getStore() ?? (globalThis as GlobalCacheHost)[GLOBAL_KEY] ?? null;
}

export function setWhatsAppRequestCache(cache: WhatsAppRequestCache | null): void {
  const host = globalThis as GlobalCacheHost;
  host[GLOBAL_KEY] = cache;
  host[GLOBAL_GETTER_KEY] = getWhatsAppRequestCache;
}

export async function runWithWhatsAppRequestCache<T>(
  cache: WhatsAppRequestCache,
  fn: () => Promise<T>,
): Promise<T> {
  setWhatsAppRequestCache(cache);
  return cacheAls.run(cache, async () => {
    try {
      return await fn();
    } finally {
      // Caller clears via setWhatsAppRequestCache(null) after printing.
    }
  });
}
