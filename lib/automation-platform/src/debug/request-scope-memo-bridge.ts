/**
 * Request-cache bridge for automation ports (server webhook path).
 * Uses the same globalThis protocol as WhatsAppRequestCache.
 */

type RequestCacheLike = {
  getOrLoad<T>(namespace: string, key: string, loader: () => Promise<T>): Promise<T>;
};

const GLOBAL_KEY = "__WHATSAPP_REQUEST_CACHE__";
const GLOBAL_GETTER_KEY = "__WHATSAPP_GET_REQUEST_CACHE__";

function getCache(): RequestCacheLike | null {
  const host = globalThis as Record<string, unknown>;
  const getter = host[GLOBAL_GETTER_KEY];
  if (typeof getter === "function") {
    return (getter as () => RequestCacheLike | null)() ?? null;
  }
  return (host[GLOBAL_KEY] as RequestCacheLike | undefined) ?? null;
}

function isWorkflowRequestMemoEnabled(): boolean {
  const raw = process.env.WORKFLOW_REQUEST_MEMO;
  if (raw == null || raw === "") return true;
  return raw !== "0" && raw.toLowerCase() !== "false" && raw.toLowerCase() !== "off";
}

export async function automationRequestGetOrLoad<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  if (!isWorkflowRequestMemoEnabled()) return loader();
  const cache = getCache();
  if (!cache) return loader();
  return cache.getOrLoad(namespace, key, loader);
}

export const AUTOMATION_REQUEST_CACHE_NS = {
  companyActorUserId: "companyActorUserId",
} as const;
