/**
 * Request-scoped memoization for scheduling factories / identical reads.
 * Uses the WhatsApp webhook request cache when present (globalThis bridge).
 * Outside a request scope, factories and loaders run uncached (browser / tests).
 *
 * Disable with WORKFLOW_REQUEST_MEMO=0 (set by API from `.workflow-request-memo` flag).
 */

import {
  WA_REQUEST_CACHE_NS,
  waRequestCacheDelete,
  waRequestGetOrCreateSync,
  waRequestGetOrLoad,
} from "@workspace/channel-platform/request-scope";

const clientKeys = new WeakMap<object, string>();
let clientSeq = 0;

function isWorkflowRequestMemoEnabled(): boolean {
  const raw = typeof process !== "undefined" ? process.env.WORKFLOW_REQUEST_MEMO : undefined;
  if (raw == null || raw === "") return true;
  return raw !== "0" && raw.toLowerCase() !== "false" && raw.toLowerCase() !== "off";
}

/** Stable per-instance key for a Supabase client within process memory. */
export function schedulingClientCacheKey(client: object): string {
  let key = clientKeys.get(client);
  if (!key) {
    key = `client-${++clientSeq}`;
    clientKeys.set(client, key);
  }
  return key;
}

export function memoizeSchedulingFactory<T>(
  namespace: string,
  client: object,
  factory: () => T,
): T {
  if (!isWorkflowRequestMemoEnabled()) return factory();
  return waRequestGetOrCreateSync(namespace, schedulingClientCacheKey(client), factory);
}

export async function memoizeSchedulingRead<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  if (!isWorkflowRequestMemoEnabled()) return loader();
  return waRequestGetOrLoad(namespace, key, loader);
}

export function invalidateSchedulingRead(namespace: string, key: string): void {
  waRequestCacheDelete(namespace, key);
}

export { WA_REQUEST_CACHE_NS };
