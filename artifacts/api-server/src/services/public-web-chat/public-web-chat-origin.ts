const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Canonical `scheme://host[:port]` or null. HTTPS only, except http://localhost / 127.0.0.1.
 * No wildcards, credentials, paths, queries, or fragments.
 */
export function normalizeWebChatOrigin(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 253 || trimmed === "null" || trimmed.includes("*")) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;

  const host = url.hostname.toLowerCase();
  if (!host) return null;

  if (url.protocol === "https:") {
    if (!host.includes(".") && !LOCAL_HOSTS.has(host)) return null;
  } else if (url.protocol === "http:") {
    if (!LOCAL_HOSTS.has(host)) return null;
  } else {
    return null;
  }

  return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`;
}

export function isWebChatOriginAllowed(
  origin: string | null | undefined,
  allowedOrigins: readonly string[] | null | undefined,
): boolean {
  const normalized = normalizeWebChatOrigin(origin);
  if (!normalized || !allowedOrigins?.length) return false;
  return allowedOrigins.some((candidate) => normalizeWebChatOrigin(candidate) === normalized);
}
