import type {
  EnsureCompanyPlatformProviderConnectionResult,
  PlatformAIProviderReadiness,
} from "./types.js";

/**
 * Pure platform-first readiness rules shared by Chat / Agent / AI Employee / Automation.
 */
export function resolvePlatformAiReadiness(input: {
  companyEntitled: boolean;
  userPermitted: boolean;
  platform: PlatformAIProviderReadiness;
  connectionId: string | null;
}): {
  ready: boolean;
  errorCode:
    | EnsureCompanyPlatformProviderConnectionResult["errorCode"]
    | "ENTITLEMENT_DENIED"
    | "PERMISSION_DENIED"
    | null;
  providerConnectionId: string | null;
} {
  if (!input.companyEntitled) {
    return { ready: false, errorCode: "ENTITLEMENT_DENIED", providerConnectionId: null };
  }
  if (!input.userPermitted) {
    return { ready: false, errorCode: "PERMISSION_DENIED", providerConnectionId: null };
  }
  if (!input.platform.ready) {
    return {
      ready: false,
      errorCode: input.platform.errorCode ?? "AI_PROVIDER_NOT_CONFIGURED",
      providerConnectionId: null,
    };
  }
  if (!input.connectionId) {
    return {
      ready: false,
      errorCode: "AI_PROVIDER_NOT_CONFIGURED",
      providerConnectionId: null,
    };
  }
  return {
    ready: true,
    errorCode: null,
    providerConnectionId: input.connectionId,
  };
}

export function assertNoSecretLeak(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  if (/"apiKey"\s*:\s*"(sk-|[^"]{16,})"/i.test(serialized)) {
    throw new Error("Secret-looking apiKey value leaked in payload");
  }
  if (serialized.includes("sk-proj-") || serialized.includes("sk-live-")) {
    throw new Error("Forbidden API key prefix leaked in payload");
  }
}
