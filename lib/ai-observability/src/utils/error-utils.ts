import type { AIErrorCatalogCode } from "../constants.js";
import type { NormalizedError } from "../types.js";

const ERROR_CODE_MAP: Record<string, AIErrorCatalogCode> = {
  AI_EXECUTION_TIMEOUT: "timeout",
  AI_EXECUTION_CANCELLED: "timeout",
  PROVIDER_TIMEOUT: "timeout",
  provider_timeout: "timeout",
  timeout: "timeout",
  RATE_LIMIT: "rate_limit",
  RATE_LIMIT_EXCEEDED: "rate_limit",
  rate_limit: "rate_limit",
  AUTHENTICATION_FAILED: "authentication",
  AUTHENTICATION: "authentication",
  UNAUTHORIZED: "authentication",
  authentication: "authentication",
  AI_PROVIDER_UNAVAILABLE: "provider_unavailable",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  provider_unavailable: "provider_unavailable",
  AI_PROVIDER_CONFIGURATION_ERROR: "invalid_configuration",
  INVALID_CONFIGURATION: "invalid_configuration",
  invalid_configuration: "invalid_configuration",
  PERMISSION_DENIED: "policy_violation",
  POLICY_VIOLATION: "policy_violation",
  policy_violation: "policy_violation",
};

export function normalizeError(error: unknown): NormalizedError {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: string }).code ?? "unknown");
    const message =
      error instanceof Error ? error.message : "An unknown AI error occurred.";
    return {
      code: mapErrorCode(code),
      message,
      source_code: code,
    };
  }

  if (error instanceof Error) {
    return {
      code: mapErrorCode(error.message),
      message: error.message,
      source_code: error.message,
    };
  }

  return {
    code: "unknown",
    message: "An unknown AI error occurred.",
    source_code: null,
  };
}

export function mapErrorCode(sourceCode: string): AIErrorCatalogCode {
  const normalized = sourceCode.trim();
  if (ERROR_CODE_MAP[normalized]) return ERROR_CODE_MAP[normalized];

  const upper = normalized.toUpperCase();
  if (ERROR_CODE_MAP[upper]) return ERROR_CODE_MAP[upper];

  const lower = normalized.toLowerCase();
  if (ERROR_CODE_MAP[lower]) return ERROR_CODE_MAP[lower];

  if (lower.includes("timeout")) return "timeout";
  if (lower.includes("rate")) return "rate_limit";
  if (lower.includes("auth")) return "authentication";
  if (lower.includes("unavailable")) return "provider_unavailable";
  if (lower.includes("config")) return "invalid_configuration";
  if (lower.includes("policy") || lower.includes("permission")) return "policy_violation";

  return "unknown";
}

export function catalogEntries(): Array<{ code: AIErrorCatalogCode; description: string }> {
  return [
    { code: "timeout", description: "Execution or provider request timed out." },
    { code: "rate_limit", description: "Provider rate limit was exceeded." },
    { code: "authentication", description: "Provider authentication failed." },
    { code: "provider_unavailable", description: "Provider is unavailable." },
    { code: "invalid_configuration", description: "Provider or runtime configuration is invalid." },
    { code: "policy_violation", description: "Execution violated a governance policy." },
    { code: "unknown", description: "Unclassified AI runtime error." },
  ];
}
