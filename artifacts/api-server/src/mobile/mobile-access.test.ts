import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideMobileAccess,
  displayNameFromAuthPayload,
  instanceSubdomain,
  permissionCodesFromAuthPayload,
  readInstanceHostname,
  type MobileCompanyRecord,
} from "./mobile-access.js";

const alpha: MobileCompanyRecord = {
  id: "company-alpha",
  name: "Alpha",
  status: "Trial",
  approvalStatus: "approved",
  subdomain: "demo-alpha-trial-company",
};

describe("mobile instance hostname", () => {
  it("accepts a company https address and reserved platform hosts", () => {
    assert.equal(readInstanceHostname("https://acme.valueor.org"), "acme.valueor.org");
    assert.equal(readInstanceHostname("acme.valueor.org"), "acme.valueor.org");
    assert.equal(readInstanceHostname("https://app.valueor.org/dashboard"), "app.valueor.org");
    assert.equal(readInstanceHostname("http://demo.localhost:5173/login"), "demo.localhost");
    assert.equal(instanceSubdomain("acme.valueor.org"), "acme");
    assert.equal(instanceSubdomain("app.valueor.org"), null);
    assert.equal(instanceSubdomain("api.valueor.org"), null);
  });

  it("rejects insecure public hosts, credentials, and raw company ids", () => {
    assert.equal(readInstanceHostname("http://acme.valueor.org"), null);
    assert.equal(readInstanceHostname("https://user:secret@acme.valueor.org"), null);
    assert.equal(readInstanceHostname("https://evil.example.com"), "evil.example.com");
    assert.equal(instanceSubdomain("evil.example.com"), null);
    assert.equal(readInstanceHostname("d0000010-0001-4001-8001-000000000001"), null);
    assert.equal(readInstanceHostname(""), null);
  });
});

describe("mobile tenant decision", () => {
  it("grants a member of the resolved company", () => {
    const decision = decideMobileAccess({
      hostname: "demo-alpha-trial-company.valueor.org",
      company: alpha,
      profileCompanyId: alpha.id,
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.scope, "tenant");
      assert.equal(decision.company?.id, alpha.id);
      assert.equal(decision.isSuperAdmin, false);
    }
  });

  it("rejects unknown hosts, inactive companies, and mismatched members", () => {
    const missing = decideMobileAccess({
      hostname: "missing.valueor.org",
      company: null,
      profileCompanyId: alpha.id,
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "tenant_host_unavailable");
    const suspended = decideMobileAccess({
      hostname: "demo-delta-expired-company.valueor.org",
      company: { ...alpha, status: "Suspended" },
      profileCompanyId: alpha.id,
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(suspended.ok, false);
    if (!suspended.ok) assert.equal(suspended.code, "tenant_host_unavailable");
    const mismatch = decideMobileAccess({
      hostname: "demo-beta-active-professional.valueor.org",
      company: { ...alpha, id: "company-beta" },
      profileCompanyId: alpha.id,
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) {
      assert.equal(mismatch.code, "forbidden");
      assert.equal(JSON.stringify(mismatch).includes("company-beta"), false);
    }
  });

  it("keeps platform and super-admin context server-side", () => {
    const superOnPlatform = decideMobileAccess({
      hostname: "app.valueor.org",
      company: null,
      profileCompanyId: null,
      isSuperAdmin: true,
      hasLiveAdminContext: false,
    });
    assert.equal(superOnPlatform.ok, true);
    if (superOnPlatform.ok) {
      assert.equal(superOnPlatform.scope, "platform");
      assert.equal(superOnPlatform.company, null);
      assert.equal(superOnPlatform.isSuperAdmin, true);
    }

    const tenantOnPlatform = decideMobileAccess({
      hostname: "app.valueor.org",
      company: null,
      profileCompanyId: alpha.id,
      isSuperAdmin: false,
      hasLiveAdminContext: false,
    });
    assert.equal(tenantOnPlatform.ok, false);
    if (!tenantOnPlatform.ok) assert.equal(tenantOnPlatform.code, "platform_access_denied");

    const superWithoutContext = decideMobileAccess({
      hostname: "demo-gamma-enterprise-company.valueor.org",
      company: { ...alpha, id: "company-gamma", status: "Active" },
      profileCompanyId: null,
      isSuperAdmin: true,
      hasLiveAdminContext: false,
    });
    assert.equal(superWithoutContext.ok, false);
    if (!superWithoutContext.ok) assert.equal(superWithoutContext.code, "admin_context_required");

    const superWithContext = decideMobileAccess({
      hostname: "demo-gamma-enterprise-company.valueor.org",
      company: { ...alpha, id: "company-gamma", status: "Active" },
      profileCompanyId: null,
      isSuperAdmin: true,
      hasLiveAdminContext: true,
    });
    assert.equal(superWithContext.ok, true);
    if (superWithContext.ok) {
      assert.equal(superWithContext.scope, "tenant");
      assert.equal(superWithContext.company?.id, "company-gamma");
    }
  });
});

describe("mobile auth payload", () => {
  it("reads permission codes and display name without token fields", () => {
    const payload = {
      profile: { full_name: "Ada Admin" },
      permissions: [{ code: "customers.view" }, { code: "" }, { code: "tickets.view" }],
    };
    assert.deepEqual(permissionCodesFromAuthPayload(payload), ["customers.view", "tickets.view"]);
    assert.equal(displayNameFromAuthPayload(payload), "Ada Admin");
    assert.deepEqual(permissionCodesFromAuthPayload({ permissions: [{ code: "access_token" }] }), ["access_token"]);
    assert.equal(JSON.stringify(permissionCodesFromAuthPayload(payload)).includes("secret"), false);
  });
});
