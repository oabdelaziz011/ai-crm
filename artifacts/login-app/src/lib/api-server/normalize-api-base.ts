/**
 * Normalizes VITE_API_SERVER_URL to the authenticated api-server mount point.
 * Server routes live under `/api/*`; webhook URLs append `/api/webhooks/*` separately.
 */
export function normalizeApiBase(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

function readApiServerRootUrl(): string {
  const runtimeEnv = import.meta.env as Record<string, string | undefined>;
  const fromVite = runtimeEnv.VITE_API_SERVER_URL?.trim() ?? "";
  if (fromVite) return fromVite;

  if (typeof window === "undefined" && typeof process !== "undefined") {
    return process.env.VITE_API_SERVER_URL?.trim() ?? "";
  }

  return "";
}

/** Authenticated api-server base URL including the `/api` prefix. */
export function resolveAuthenticatedApiBase(): string {
  return normalizeApiBase(readApiServerRootUrl());
}

export function isAuthenticatedApiConfigured(): boolean {
  return Boolean(resolveAuthenticatedApiBase());
}
