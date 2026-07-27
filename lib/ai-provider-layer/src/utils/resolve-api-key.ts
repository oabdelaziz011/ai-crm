/**
 * Resolves provider credentials stored on the company connection configuration.
 * Browser-safe: never reads process.env or VITE secret fallbacks.
 */
export function resolveProviderApiKey(configuration: Record<string, unknown>): string {
  return typeof configuration.apiKey === "string" && configuration.apiKey.trim()
    ? configuration.apiKey.trim()
    : "";
}
