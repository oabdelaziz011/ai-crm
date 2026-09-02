/**
 * Customer workspace commercial + RBAC gating unit tests (no DB / campaigns / Meta).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditEntityAllowedByModuleAccess,
  buildCustomerAuditModuleAccess,
  filterAccessibleWorkspaceTabs,
  isActivitySourceAccessible,
  isProfileTabAccessible,
  isQuickActionAllowed,
  isWorkspaceTabAccessible,
  resolveAccessibleProfileTab,
  type CustomerWorkspaceAccessContext,
} from "./workspace-feature-access.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function ctx(input: Partial<CustomerWorkspaceAccessContext>): CustomerWorkspaceAccessContext {
  return {
    isSuperAdmin: false,
    hasPermission: () => false,
    isModuleEnabled: () => false,
    entitlementResolved: true,
    ...input,
  };
}

describe("workspace feature access", () => {
  it("denies bookings tab when entitlement missing despite RBAC", () => {
    const access = ctx({
      hasPermission: (p) => p === "bookings.view",
      isModuleEnabled: (c) => (c === "bookings" ? false : true),
    });
    assert.equal(isWorkspaceTabAccessible("bookings", access), false);
  });

  it("allows bookings tab when entitlement and RBAC both pass", () => {
    const access = ctx({
      hasPermission: (p) => p === "bookings.view",
      isModuleEnabled: (c) => c === "bookings",
    });
    assert.equal(isWorkspaceTabAccessible("bookings", access), true);
  });

  it("fail-closed while entitlements unresolved", () => {
    const access = ctx({
      entitlementResolved: false,
      hasPermission: () => true,
      isModuleEnabled: () => true,
    });
    assert.deepEqual(filterAccessibleWorkspaceTabs(access), []);
  });

  it("super-admin bypasses commercial gates", () => {
    const access = ctx({
      isSuperAdmin: true,
      hasPermission: () => false,
      isModuleEnabled: () => false,
    });
    assert.equal(isWorkspaceTabAccessible("bookings", access), true);
  });

  it("redirects denied deep-link tab to overview", () => {
    const access = ctx({
      hasPermission: (p) => p === "customers.view" || p === "audit_logs.view",
      isModuleEnabled: () => true,
    });
    assert.equal(resolveAccessibleProfileTab("bookings", access), "overview");
  });

  it("activity sources require module entitlement", () => {
    const access = ctx({
      hasPermission: (p) => p === "customers.view" || p === "bookings.view",
      isModuleEnabled: (c) => c !== "bookings",
    });
    assert.equal(isActivitySourceAccessible("customer-lifecycle", access), true);
    assert.equal(isActivitySourceAccessible("bookings", access), false);
    assert.equal(isActivitySourceAccessible("whatsapp", access), false);
  });

  it("whatsapp quick action requires channel entitlement", () => {
    const access = ctx({
      hasPermission: (p) => p === "whatsapp.view",
      isModuleEnabled: (c) => c !== "whatsapp_channel",
    });
    assert.equal(isQuickActionAllowed("whatsapp", access), false);
  });

  it("files tab maps to operations entitlement", () => {
    const access = ctx({
      hasPermission: (p) => p === "entity.files.read",
      isModuleEnabled: (c) => c === "operations",
    });
    assert.equal(isWorkspaceTabAccessible("files", access), true);
  });

  it("campaigns tab requires campaigns commercial entitlement", () => {
    const denied = ctx({
      hasPermission: (p) => p === "campaigns.view",
      isModuleEnabled: () => false,
    });
    const allowed = ctx({
      hasPermission: (p) => p === "campaigns.view",
      isModuleEnabled: (code) => code === "campaigns",
    });
    assert.equal(isWorkspaceTabAccessible("campaigns", denied), false);
    assert.equal(isWorkspaceTabAccessible("campaigns", allowed), true);
  });

  it("history audit filters module entities", () => {
    const moduleAccess = buildCustomerAuditModuleAccess(
      ctx({
        hasPermission: (p) => p === "customers.view" || p === "audit_logs.view",
        isModuleEnabled: () => false,
      }),
    );
    assert.equal(auditEntityAllowedByModuleAccess("customers", moduleAccess), true);
    assert.equal(auditEntityAllowedByModuleAccess("bookings", moduleAccess), false);
    assert.equal(auditEntityAllowedByModuleAccess("invoices", moduleAccess), false);
  });

  it("denies unknown history audit entities (fail closed)", () => {
    const moduleAccess = buildCustomerAuditModuleAccess(
      ctx({
        hasPermission: () => true,
        isModuleEnabled: () => true,
      }),
    );
    assert.equal(auditEntityAllowedByModuleAccess("mystery_module", moduleAccess), false);
    assert.equal(auditEntityAllowedByModuleAccess("", moduleAccess), false);
  });

  it("known module history entities retain correct entitlement behavior", () => {
    const bookingsOnly = buildCustomerAuditModuleAccess(
      ctx({
        hasPermission: (p) => p === "bookings.view",
        isModuleEnabled: (c) => c === "bookings",
      }),
    );
    const financeOnly = buildCustomerAuditModuleAccess(
      ctx({
        hasPermission: (p) => p === "invoices.view",
        isModuleEnabled: (c) => c === "finance",
      }),
    );
    assert.equal(auditEntityAllowedByModuleAccess("scheduling_bookings", bookingsOnly), true);
    assert.equal(auditEntityAllowedByModuleAccess("invoices", bookingsOnly), false);
    assert.equal(auditEntityAllowedByModuleAccess("payments", financeOnly), true);
    assert.equal(auditEntityAllowedByModuleAccess("support_tickets", financeOnly), false);
  });

  it("bookings-only company cannot receive agent-activity WhatsApp notes", () => {
    const access = ctx({
      hasPermission: (p) => p === "customers.view" || p === "bookings.view",
      isModuleEnabled: (c) => c === "bookings",
    });
    assert.equal(isActivitySourceAccessible("agent-activity", access), false);
    assert.equal(isActivitySourceAccessible("agent", access), false);
  });

  it("whatsapp_channel company with channel RBAC can receive agent-activity notes", () => {
    const access = ctx({
      hasPermission: (p) => p === "customers.view" || p === "whatsapp.view",
      isModuleEnabled: (c) => c === "whatsapp_channel",
    });
    assert.equal(isActivitySourceAccessible("agent-activity", access), true);
    assert.equal(isActivitySourceAccessible("agent", access), true);
  });
});

describe("workspace feature gating wiring", () => {
  it("page gates bookings/invoices queries and filters nav tabs", () => {
    const page = readFileSync(
      join(__dirname, "../../pages/dashboard/customers/customer-workspace-page.tsx"),
      "utf8",
    );
    const shell = readFileSync(
      join(__dirname, "../../components/customer-workspace/customer-workspace-shell.tsx"),
      "utf8",
    );
    assert.match(page, /useCustomerWorkspaceAccess/);
    assert.match(page, /enabled: needsBookingData/);
    assert.match(page, /enabled: needsFinanceData/);
    assert.match(page, /WorkspaceTabAccessDenied/);
    assert.match(shell, /accessibleTabs/);
    assert.doesNotMatch(page, /useBookings\(\)/);
  });

  it("activity bridge checks publisher entitlement before collect", () => {
    const bridge = readFileSync(
      join(__dirname, "../customer-timeline/adapters/activity-timeline-bridge.ts"),
      "utf8",
    );
    assert.match(bridge, /publisherAllowed/);
    assert.match(bridge, /canAccessActivitySource/);
  });

  it("campaigns remain separate from history", () => {
    assert.equal(isProfileTabAccessible("campaigns", ctx({ hasPermission: () => true, isModuleEnabled: () => true })), true);
    assert.notEqual(
      filterAccessibleWorkspaceTabs(ctx({ hasPermission: () => true, isModuleEnabled: () => true })).indexOf("campaigns"),
      filterAccessibleWorkspaceTabs(ctx({ hasPermission: () => true, isModuleEnabled: () => true })).indexOf("history"),
    );
  });

  it("/dashboard/invoices requires finance commercial entitlement", () => {
    const registry = readFileSync(
      join(__dirname, "../../config/dashboard-route-registry.ts"),
      "utf8",
    );
    const invoicesBlock = registry.slice(
      registry.indexOf('id: "invoices"'),
      registry.indexOf('id: "financial"'),
    );
    assert.match(invoicesBlock, /commercialFeatureCode:\s*"finance"/);
    assert.match(invoicesBlock, /permission:\s*"invoices\.view"/);
  });

  it("history repository filters metadata audit rows before accumulation", () => {
    const repo = readFileSync(
      join(__dirname, "./customer-audit-history-repository.ts"),
      "utf8",
    );
    assert.match(repo, /auditEntityAllowedByModuleAccess\(row\.entity, input\.moduleAccess\)/);
  });
});
