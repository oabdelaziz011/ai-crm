import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { decodeAdminHostHandoff, encodeAdminHostHandoff } from "./admin-host-handoff.ts";
import {
  allocateCompanySubdomain,
  normalizeCompanySubdomain,
  parseCompanyHost,
} from "./company-subdomain.ts";

describe("company subdomain", () => {
  it("normalizes names and rejects reserved or invalid labels", () => {
    assert.equal(normalizeCompanySubdomain("  Acme Clinic  "), "acme-clinic");
    assert.equal(normalizeCompanySubdomain("app"), null);
    assert.equal(normalizeCompanySubdomain("api"), null);
    assert.equal(normalizeCompanySubdomain("www"), null);
    assert.equal(normalizeCompanySubdomain("a"), null);
    assert.equal(normalizeCompanySubdomain("bad label!"), "bad-label");
    assert.equal(normalizeCompanySubdomain("-admin-"), null);
  });

  it("adds a suffix when the subdomain is already taken", () => {
    const taken = new Set(["acme", "acme-2"]);
    assert.equal(allocateCompanySubdomain("Acme", taken), "acme-3");
    assert.equal(allocateCompanySubdomain("Admin", new Set()), "company");
  });

  it("resolves tenant hosts and leaves platform, reserved, and foreign hosts alone", () => {
    assert.deepEqual(parseCompanyHost("acme.valueor.org"), { kind: "tenant", subdomain: "acme" });
    assert.deepEqual(parseCompanyHost("clinic.localhost"), { kind: "tenant", subdomain: "clinic" });
    assert.deepEqual(parseCompanyHost("app.valueor.org"), { kind: "platform" });
    assert.deepEqual(parseCompanyHost("www.valueor.org"), { kind: "platform" });
    assert.deepEqual(parseCompanyHost("localhost"), { kind: "platform" });
    assert.deepEqual(parseCompanyHost("api.valueor.org"), { kind: "platform" });
    assert.deepEqual(parseCompanyHost("webhook.valueor.org"), { kind: "platform" });
    assert.deepEqual(parseCompanyHost("unknown.example.com"), { kind: "ignore" });
    assert.deepEqual(parseCompanyHost("not a host"), { kind: "ignore" });
  });
});

describe("admin host handoff", () => {
  it("round-trips a session handoff and ignores unrelated window names", () => {
    const encoded = encodeAdminHostHandoff({
      accessToken: "access",
      refreshToken: "refresh",
      context: {
        id: "ctx",
        companyId: "company",
        companyName: "Gamma",
        subdomain: "demo-gamma",
        returnOrigin: "http://127.0.0.1:5173",
      },
    });
    assert.deepEqual(decodeAdminHostHandoff(encoded)?.context?.subdomain, "demo-gamma");
    assert.equal(decodeAdminHostHandoff("other"), null);
  });
});

describe("company subdomain migration", () => {
  const sql = readFileSync(
    new URL("../../../../../supabase/migrations/445_company_subdomains_and_platform_admin_context.sql", import.meta.url),
    "utf8",
  );

  it("keeps company identity separate from the subdomain and blocks tenant edits", () => {
    assert.match(sql, /add column if not exists subdomain text/);
    assert.match(sql, /companies_subdomain_unique/);
    assert.match(sql, /is_super_admin\(\)/);
    assert.match(sql, /platform_admin_contexts/);
    assert.match(sql, /expires_at/);
    assert.match(sql, /revoked_at/);
    assert.match(sql, /scope', 'platform'/);
    assert.doesNotMatch(sql, /grant execute on function public\.open_platform_company_context\(uuid\) to anon/);
  });
});
