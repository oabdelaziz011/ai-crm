/**
 * Company hostnames.
 *
 * Production: `{subdomain}.valueor.org`, with `app.valueor.org` as the platform host.
 * Local: `{subdomain}.localhost` (for example `acme.localhost`). `localhost` and
 * `app.localhost` stay the platform host. No production DNS change is required.
 * Webhook and API hosts (`api.valueor.org`, fly.dev, and so on) are not tenant hosts.
 */

export const COMPANY_SUBDOMAIN_ROOTS = ["valueor.org", "localhost"] as const;

export const RESERVED_COMPANY_SUBDOMAINS = [
  "app",
  "api",
  "admin",
  "www",
  "mail",
  "smtp",
  "ftp",
  "localhost",
  "valueor",
  "platform",
  "support",
  "billing",
  "webhook",
  "webhooks",
  "static",
  "cdn",
  "status",
  "docs",
  "help",
  "auth",
  "login",
  "dashboard",
  "superadmin",
  "root",
  "ns1",
  "ns2",
  "staging",
  "test",
  "dev",
] as const;

const RESERVED = new Set<string>(RESERVED_COMPANY_SUBDOMAINS);
const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizeCompanySubdomain(value: string | null | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (!SUBDOMAIN_PATTERN.test(normalized)) return null;
  if (RESERVED.has(normalized)) return null;
  return normalized;
}

export function allocateCompanySubdomain(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const base = normalizeCompanySubdomain(name) ?? "company";
  let candidate = RESERVED.has(base) ? "company" : base;
  let suffix = 2;
  while (taken.has(candidate) || RESERVED.has(candidate)) {
    const stem = candidate.startsWith(base) ? base : "company";
    candidate = `${stem.slice(0, 36)}-${suffix}`;
    suffix += 1;
    if (suffix > 100) break;
  }
  return candidate;
}

export type ParsedCompanyHost =
  | { kind: "platform" }
  | { kind: "ignore" }
  | { kind: "tenant"; subdomain: string };

export function parseCompanyHost(hostname: string | null | undefined): ParsedCompanyHost {
  const host = (hostname ?? "").trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return { kind: "platform" };
  }
  for (const root of COMPANY_SUBDOMAIN_ROOTS) {
    if (host === root || host === `www.${root}` || host === `app.${root}`) {
      return { kind: "platform" };
    }
    if (!host.endsWith(`.${root}`)) continue;
    const label = host.slice(0, -(root.length + 1));
    if (!label || label.includes(".")) return { kind: "ignore" };
    if (RESERVED.has(label)) return { kind: "platform" };
    const subdomain = normalizeCompanySubdomain(label);
    if (!subdomain) return { kind: "ignore" };
    return { kind: "tenant", subdomain };
  }
  return { kind: "ignore" };
}

export function companyHostname(subdomain: string, root = "valueor.org"): string {
  return `${subdomain}.${root}`;
}

export function isOperableCompanyStatus(status: string | null | undefined, approvalStatus?: string | null): boolean {
  if (approvalStatus === "rejected") return false;
  return status === "Active" || status === "Trial";
}
