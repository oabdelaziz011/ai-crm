import { HttpError } from "../middleware/error-handler.js";

function isLocalValueorMode(): boolean {
  const mode = String(process.env.VALUEOR_ENV ?? "")
    .trim()
    .toLowerCase();
  if (mode === "production" || mode === "prod") return false;
  if (mode === "local" || mode === "localstack" || mode === "development") return true;
  if (!mode) {
    return String(process.env.NODE_ENV ?? "")
      .trim()
      .toLowerCase() !== "production";
  }
  return false;
}

function isLocalIntegrationEnabled(): boolean {
  const raw = String(process.env.LOCAL_INTEGRATION_ENABLED ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * True only when LOCAL + explicit integration profile + outbound opt-in.
 * Production never consults these flags (guard no-ops outside local mode).
 */
export function isLocalExternalOutboundPermitted(): boolean {
  if (!isLocalValueorMode()) return true;
  return (
    process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND === "1" && isLocalIntegrationEnabled()
  );
}

/**
 * Block real external messaging in VALUEOR_ENV=local unless explicitly opted in.
 * Health/readiness and credential checks remain allowed.
 *
 * Integration testing requires BOTH:
 *   LOCAL_INTEGRATION_ENABLED=true|1
 *   ALLOW_LOCAL_EXTERNAL_OUTBOUND=1
 */
export function assertLocalExternalOutboundAllowed(action: string): void {
  if (!isLocalValueorMode()) return;
  if (isLocalExternalOutboundPermitted()) return;

  throw new HttpError(
    403,
    `External outbound (${action}) is blocked in VALUEOR_ENV=local. For intentional local integration tests set LOCAL_INTEGRATION_ENABLED=true and ALLOW_LOCAL_EXTERNAL_OUTBOUND=1 in .env.local.integration.`,
    "LOCAL_OUTBOUND_BLOCKED",
  );
}
