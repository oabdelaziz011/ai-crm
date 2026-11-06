/**
 * Native destinations. Authentication and the signed-in company are required.
 * A payload company id that differs from the session is rejected.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESOURCES = new Set([
  "customer",
  "lead",
  "opportunity",
  "conversation",
  "ticket",
  "email",
  "notification",
]);

export type DeepLinkTarget = { resource: string; id: string; companyId: string | null };

export type DeepLinkDecision =
  | { ok: true; href: string }
  | { ok: false; reason: "unauthenticated" | "session_expired" | "invalid" | "cross_tenant"; href: "/login" | "/(workspace)" };

export function parseDeepLinkTarget(url: string | null | undefined): DeepLinkTarget | null {
  if (!url) return null;
  let path = url.trim();
  try {
    const parsed = new URL(path);
    const http = parsed.protocol === "http:" || parsed.protocol === "https:";
    path = http ? `${parsed.pathname}${parsed.search}` : `/${parsed.hostname}${parsed.pathname}${parsed.search}`;
  } catch {
    path = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "/");
  }
  const [pathname, query = ""] = path.split("?");
  const parts = pathname.split("/").filter(Boolean);
  const resource = parts[0]?.toLowerCase() ?? "";
  const id = parts[1] ?? "";
  if (!RESOURCES.has(resource) || !UUID.test(id)) return null;
  const params = new URLSearchParams(query);
  const companyId = params.get("companyId");
  return { resource, id, companyId: companyId && UUID.test(companyId) ? companyId : null };
}

export function hrefForDeepLink(target: DeepLinkTarget): string {
  if (target.resource === "email") return `/conversation/${target.id}`;
  if (target.resource === "notification") return "/notifications";
  return `/${target.resource}/${target.id}`;
}

export function decideMobileDeepLink(input: {
  url?: string | null;
  payload?: { resource?: unknown; id?: unknown; companyId?: unknown } | null;
  authenticated: boolean;
  sessionExpired: boolean;
  companyId: string | null;
}): DeepLinkDecision {
  if (input.sessionExpired || !input.authenticated) {
    return { ok: false, reason: input.sessionExpired ? "session_expired" : "unauthenticated", href: "/login" };
  }
  const fromPayload = input.payload
    ? parseDeepLinkTarget(`valueor://${String(input.payload.resource ?? "")}/${String(input.payload.id ?? "")}`)
    : null;
  const target = fromPayload ?? parseDeepLinkTarget(input.url);
  if (!target) return { ok: false, reason: "invalid", href: "/(workspace)" };
  const payloadCompany = typeof input.payload?.companyId === "string" ? input.payload.companyId : target.companyId;
  if (payloadCompany && payloadCompany !== input.companyId) {
    return { ok: false, reason: "cross_tenant", href: "/(workspace)" };
  }
  return { ok: true, href: hrefForDeepLink(target) };
}
