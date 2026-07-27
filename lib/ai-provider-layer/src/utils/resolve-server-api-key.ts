import { readServerEnv } from "@workspace/platform-crypto/server";

/**
 * Resolves provider API keys from connection configuration, with optional server env fallback.
 * Server-only — do not import from browser bundles.
 */
export function resolveProviderApiKeyWithServerFallback(
  configuration: Record<string, unknown>,
  envVar = "OPENAI_API_KEY",
): string {
  const configured =
    typeof configuration.apiKey === "string" && configuration.apiKey.trim()
      ? configuration.apiKey.trim()
      : "";
  if (configured) return configured;

  return readServerEnv(envVar);
}
