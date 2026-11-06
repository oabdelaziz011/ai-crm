/**
 * Mobile tenant access decisions.
 *
 * The native app sends an instance hostname. The company id is resolved here
 * from that hostname. A client-supplied company id is never accepted.
 */
import { parseCompanyHost } from "@login-app/lib/platform/company-subdomain";

export const MOBILE_INSTANCE_HEADER = "x-valueor-instance";

export type MobileCompanyRecord = {
  id: string;
  name: string | null;
  status: string | null;
  approvalStatus: string | null;
  subdomain: string | null;
};

export type MobileAccessDenial = {
  ok: false;
  status: 400 | 403;
  code:
    | "invalid_instance"
    | "tenant_host_unavailable"
    | "forbidden"
    | "admin_context_required"
    | "platform_access_denied";
  message: string;
};

export type MobileAccessGrant = {
  ok: true;
  scope: "tenant" | "platform";
  company: MobileCompanyRecord | null;
  isSuperAdmin: boolean;
};

export type MobileAccessDecision = MobileAccessGrant | MobileAccessDenial;

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readInstanceHostname(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.length > 253 || /\s/.test(raw)) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const local = LOCAL_HTTP_HOSTS.has(hostname) || hostname.endsWith(".localhost");
  if (url.protocol === "http:" && !local) return null;
  if (!hostname) return null;
  return hostname;
}

export function decideMobileAccess(input: {
  hostname: string | null;
  company: MobileCompanyRecord | null;
  profileCompanyId: string | null;
  isSuperAdmin: boolean;
  hasLiveAdminContext: boolean;
}): MobileAccessDecision {
  if (!input.hostname) {
    return {
      ok: false,
      status: 400,
      code: "invalid_instance",
      message: "Enter a company address such as https://acme.valueor.org.",
    };
  }

  const parsed = parseCompanyHost(input.hostname);
  if (parsed.kind === "ignore") {
    return {
      ok: false,
      status: 400,
      code: "invalid_instance",
      message: "Enter a company address such as https://acme.valueor.org.",
    };
  }

  if (parsed.kind === "platform") {
    if (!input.isSuperAdmin) {
      return {
        ok: false,
        status: 403,
        code: "platform_access_denied",
        message: "Platform super administrator access is required.",
      };
    }
    return { ok: true, scope: "platform", company: null, isSuperAdmin: true };
  }

  const company = input.company;
  const unavailable =
    !company || company.status === "Suspended" || company.approvalStatus === "rejected";
  if (unavailable || !company) {
    return {
      ok: false,
      status: 403,
      code: "tenant_host_unavailable",
      message: "Company host is not available.",
    };
  }

  if (input.isSuperAdmin) {
    if (!input.hasLiveAdminContext) {
      return {
        ok: false,
        status: 403,
        code: "admin_context_required",
        message: "Platform administration context is required for this company.",
      };
    }
    return { ok: true, scope: "tenant", company, isSuperAdmin: true };
  }

  if (!input.profileCompanyId || input.profileCompanyId !== company.id) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "Access denied for this company.",
    };
  }

  return { ok: true, scope: "tenant", company, isSuperAdmin: false };
}

export function instanceSubdomain(hostname: string | null): string | null {
  if (!hostname) return null;
  const parsed = parseCompanyHost(hostname);
  return parsed.kind === "tenant" ? parsed.subdomain : null;
}

export function permissionCodesFromAuthPayload(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const permissions = (payload as { permissions?: unknown }).permissions;
  if (!Array.isArray(permissions)) return [];
  const codes = new Set<string>();
  for (const row of permissions) {
    if (!row || typeof row !== "object") continue;
    const code = (row as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) codes.add(code.trim());
  }
  return [...codes];
}

export function displayNameFromAuthPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const profile = (payload as { profile?: unknown }).profile;
  if (!profile || typeof profile !== "object") return null;
  const name = (profile as { full_name?: unknown }).full_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
