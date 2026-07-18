export const AI_PROVIDER_KEYS = [
  "openai",
  "claude",
  "gemini",
  "azure_openai",
  "deepseek",
  "ollama",
  "local_models",
] as const;

export type AIProviderKey = (typeof AI_PROVIDER_KEYS)[number];

export const ADAPTER_PROVIDER_KEYS = ["openai", "claude", "gemini", "azure_openai"] as const;

export type AdapterProviderKey = (typeof ADAPTER_PROVIDER_KEYS)[number];

export const PROVIDER_CONNECTION_STATUSES = ["pending", "active", "disabled", "error"] as const;

export type ProviderConnectionStatus = (typeof PROVIDER_CONNECTION_STATUSES)[number];

export const PROVIDER_HEALTH_STATUSES = [
  "connected",
  "disconnected",
  "warning",
  "error",
  "unknown",
] as const;

export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATUSES)[number];

export const AI_PROVIDER_PERMISSIONS = {
  view: "ai.providers.view",
  manage: "ai.providers.manage",
} as const;

export const AI_PROVIDER_AUDIT_EVENTS = [
  "provider_connected",
  "provider_enabled",
  "provider_disabled",
  "provider_updated",
  "provider_health_changed",
] as const;

export type AIProviderAuditEvent = (typeof AI_PROVIDER_AUDIT_EVENTS)[number];

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_PROVIDER_MAX_RETRIES = 2;
