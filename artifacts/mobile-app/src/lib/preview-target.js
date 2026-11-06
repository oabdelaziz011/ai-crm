/** Preview and production address checks. Plain JavaScript so Expo can load it from app.config. */

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function jwtRole(token) {
  const part = String(token).split(".")[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function isLoopbackHost(url) {
  const host = hostnameOf(url);
  return host == null || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

const PRODUCTION_PUBLIC_HOSTS = new Set(["api.valueor.org", "app.valueor.org", "webhook.valueor.org"]);

function isPrivateLanHost(host) {
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const second = Number(host.split(".")[1]);
  if (/^172\.\d+\.\d+\.\d+$/.test(host)) return second >= 16 && second <= 31;
  return /^10\.\d+\.\d+\.\d+$/.test(host);
}

/** Desktop Metro, Android emulator, phone on the same LAN, or a hosted name. */
function classifyMobileAddress(url) {
  const host = hostnameOf(url);
  if (!host) return "invalid";
  if (host === "10.0.2.2") return "android-emulator";
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return "desktop-loopback";
  if (isPrivateLanHost(host)) return "lan-device";
  if (PRODUCTION_PUBLIC_HOSTS.has(host)) return "production-public";
  return "hosted";
}

function endpointEnvironment(url, recordedProductionHost) {
  const kind = classifyMobileAddress(url);
  if (kind === "desktop-loopback" || kind === "android-emulator" || kind === "lan-device") return "local";
  if (kind === "production-public") return "production";
  const host = hostnameOf(url);
  if (recordedProductionHost && host === recordedProductionHost.trim().toLowerCase()) return "production";
  if (kind === "hosted") return "staging";
  return "invalid";
}

function assessMobileBuildTarget(input) {
  const apiUrl = input.apiUrl?.trim() ?? "";
  const supabaseUrl = input.supabaseUrl?.trim() ?? "";
  const key = input.supabasePublishableKey?.trim() ?? "";
  if (input.profile === "local" && !apiUrl && !supabaseUrl && !key) return { ok: true };
  const stagingProfile = input.profile === "preview" || input.profile === "staging-apk";
  if (!stagingProfile && input.profile !== "production" && input.profile !== "development" && input.profile !== "local") {
    return { ok: true };
  }
  if (!apiUrl || !supabaseUrl || !key) return { ok: false, code: "missing_config" };
  if (/service_role/i.test(key) || key.startsWith("sb_secret_") || jwtRole(key) === "service_role") return { ok: false, code: "privileged_key" };
  const recordedHost = input.recordedProductionHost?.trim().toLowerCase() || "";
  const apiEnv = endpointEnvironment(apiUrl, recordedHost);
  const supabaseEnv = endpointEnvironment(supabaseUrl, recordedHost);
  if (input.profile === "local") {
    if (apiEnv === "production" || supabaseEnv === "production") return { ok: false, code: "production_target" };
    if (apiEnv !== supabaseEnv) return { ok: false, code: "environment_mismatch" };
    if (apiEnv === "staging" && (!apiUrl.startsWith("https://") || !supabaseUrl.startsWith("https://"))) {
      return { ok: false, code: "insecure_preview_url" };
    }
    return { ok: true };
  }
  if (input.profile === "development") {
    if (apiEnv !== "local" || supabaseEnv !== "local") return { ok: false, code: "development_not_local" };
    return { ok: true };
  }
  if (isLoopbackHost(apiUrl) || isLoopbackHost(supabaseUrl)) return { ok: false, code: "loopback_url" };
  if (stagingProfile) {
    if (!apiUrl.startsWith("https://") || !supabaseUrl.startsWith("https://")) return { ok: false, code: "insecure_preview_url" };
    if (apiEnv === "production" || supabaseEnv === "production") return { ok: false, code: "production_target" };
    if (apiEnv !== "staging" || supabaseEnv !== "staging") return { ok: false, code: "environment_mismatch" };
    return { ok: true };
  }
  if (!apiUrl.startsWith("https://") || !supabaseUrl.startsWith("https://")) return { ok: false, code: "insecure_production_url" };
  if (apiEnv === "staging" || supabaseEnv === "staging") return { ok: false, code: "staging_target" };
  if (apiEnv !== "production" || supabaseEnv !== "production") return { ok: false, code: "production_target_mismatch" };
  return { ok: true };
}

module.exports = { assessMobileBuildTarget, classifyMobileAddress, endpointEnvironment, isLoopbackHost };
