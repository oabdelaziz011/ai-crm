export type MobilePublicConfig = {
  apiUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type MobileConfigInput = {
  apiUrl?: string | null;
  supabaseUrl?: string | null;
  supabasePublishableKey?: string | null;
};

function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = JSON.parse(globalThis.atob(padded)) as { role?: unknown };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function readMobileConfig(
  input: MobileConfigInput | null | undefined,
): { ok: true; config: MobilePublicConfig } | { ok: false; code: "missing_config" | "privileged_key" } {
  const apiUrl = input?.apiUrl?.trim() ?? "";
  const supabaseUrl = input?.supabaseUrl?.trim() ?? "";
  const supabasePublishableKey = input?.supabasePublishableKey?.trim() ?? "";
  if (!apiUrl || !supabaseUrl || !supabasePublishableKey) return { ok: false, code: "missing_config" };
  if (/service_role/i.test(supabasePublishableKey) || supabasePublishableKey.startsWith("sb_secret_") || jwtRole(supabasePublishableKey) === "service_role") {
    return { ok: false, code: "privileged_key" };
  }
  return {
    ok: true,
    config: {
      apiUrl: apiUrl.replace(/\/+$/, ""),
      supabaseUrl,
      supabasePublishableKey,
    },
  };
}

export { assessMobileBuildTarget, classifyMobileAddress, endpointEnvironment, isLoopbackHost } from "./preview-target.js";
