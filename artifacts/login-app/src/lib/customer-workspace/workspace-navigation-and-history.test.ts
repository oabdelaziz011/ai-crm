/**
 * Navigation + customer audit history unit tests (no DB / Meta / queue).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertWorkspaceTabOrderContract,
  WORKSPACE_MORE_TABS,
  WORKSPACE_TOP_TABS,
  profileTabToWorkspaceTopTab,
  workspaceTopTabToProfileTab,
} from "./workspace-navigation.ts";
import {
  assertCustomerAuditHistoryQuery,
  auditLogBelongsToCustomer,
  customerAuditHistoryUsesPhoneMatching,
  extractCustomerAuditFieldChanges,
  mapAuditLogToCustomerHistoryItem,
  paginateCustomerAuditHistoryItems,
  resolveCustomerAuditTitleKey,
  sortCustomerAuditHistoryItems,
  type RawAuditLogRow,
} from "./customer-audit-history.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("workspace navigation — no More menu", () => {
  it("exposes 11 top-level tabs in required order", () => {
    assert.deepEqual(WORKSPACE_TOP_TABS, [
      "overview",
      "activity",
      "bookings",
      "invoices",
      "communication",
      "tickets",
      "payments",
      "files",
      "ai",
      "campaigns",
      "history",
    ]);
    const contract = assertWorkspaceTabOrderContract();
    assert.equal(contract.count, 11);
    assert.equal(contract.historyLast, true);
    assert.equal(contract.campaignsBeforeHistory, true);
    assert.equal(contract.hasMore, false);
    assert.equal(WORKSPACE_MORE_TABS.length, 0);
  });

  it("maps profile tabs without merging campaigns/history", () => {
    assert.equal(workspaceTopTabToProfileTab("campaigns"), "campaigns");
    assert.equal(workspaceTopTabToProfileTab("history"), "history");
    assert.equal(profileTabToWorkspaceTopTab("campaigns"), "campaigns");
    assert.equal(profileTabToWorkspaceTopTab("history"), "history");
    assert.equal(profileTabToWorkspaceTopTab("timeline"), "activity");
  });

  it("shell uses horizontal scroll, not More dropdown", () => {
    const shell = readFileSync(
      join(__dirname, "../../components/customer-workspace/customer-workspace-shell.tsx"),
      "utf8",
    );
    assert.match(shell, /overflow-x-auto/);
    assert.match(shell, /accessibleTabs/);
    assert.doesNotMatch(shell, /WORKSPACE_MORE_TABS/);
    assert.doesNotMatch(shell, /tabs\.more/);
  });
});

describe("customer audit history — filtering & presentation", () => {
  it("requires companyId + customerId and never uses phone matching", () => {
    assert.throws(() =>
      assertCustomerAuditHistoryQuery({ companyId: "", customerId: "c1" }),
    );
    assert.equal(customerAuditHistoryUsesPhoneMatching(), false);
    const src = readFileSync(join(__dirname, "customer-audit-history.ts"), "utf8");
    const repo = readFileSync(
      join(__dirname, "customer-audit-history-repository.ts"),
      "utf8",
    );
    for (const text of [src, repo]) {
      assert.doesNotMatch(text, /slice\(-9\)|lastNine|\.eq\("phone"/);
      assert.doesNotMatch(text, /from\("customers"\)[\s\S]{0,120}\.eq\("phone_e164"/);
    }
  });

  it("tenant isolation: other company rows excluded", () => {
    const row: RawAuditLogRow = {
      id: "a1",
      user_id: null,
      company_id: "co-b",
      action: "UPDATE",
      entity: "customers",
      entity_id: "cust-1",
      metadata: { old: { name: "A" }, new: { name: "B" } },
      created_at: "2026-09-01T00:00:00.000Z",
    };
    assert.equal(
      auditLogBelongsToCustomer({
        row,
        companyId: "co-a",
        customerId: "cust-1",
        relatedEntityIds: new Set(),
      }),
      false,
    );
  });

  it("includes direct customer entity and metadata.customer_id", () => {
    assert.equal(
      auditLogBelongsToCustomer({
        row: {
          id: "a1",
          user_id: "u1",
          company_id: "co-a",
          action: "CREATE",
          entity: "customers",
          entity_id: "cust-1",
          metadata: {},
          created_at: "2026-09-01T00:00:00.000Z",
        },
        companyId: "co-a",
        customerId: "cust-1",
        relatedEntityIds: new Set(),
      }),
      true,
    );
    assert.equal(
      auditLogBelongsToCustomer({
        row: {
          id: "a2",
          user_id: null,
          company_id: "co-a",
          action: "UPDATE",
          entity: "marketing_campaign_recipients",
          entity_id: "r1",
          metadata: { customer_id: "cust-1", source: "marketing_campaign" },
          created_at: "2026-09-01T00:00:00.000Z",
        },
        companyId: "co-a",
        customerId: "cust-1",
        relatedEntityIds: new Set(),
      }),
      true,
    );
  });

  it("includes related booking/ticket/invoice only via owned entity ids", () => {
    const related = new Set(["scheduling_bookings:b1"]);
    assert.equal(
      auditLogBelongsToCustomer({
        row: {
          id: "a3",
          user_id: null,
          company_id: null,
          action: "CREATE",
          entity: "scheduling_bookings",
          entity_id: "b1",
          metadata: {},
          created_at: "2026-09-01T00:00:00.000Z",
        },
        companyId: "co-a",
        customerId: "cust-1",
        relatedEntityIds: related,
      }),
      true,
    );
    assert.equal(
      auditLogBelongsToCustomer({
        row: {
          id: "a4",
          user_id: null,
          company_id: null,
          action: "CREATE",
          entity: "scheduling_bookings",
          entity_id: "other",
          metadata: {},
          created_at: "2026-09-01T00:00:00.000Z",
        },
        companyId: "co-a",
        customerId: "cust-1",
        relatedEntityIds: related,
      }),
      false,
    );
  });

  it("extracts before/after only when persisted; never invents phone", () => {
    const changes = extractCustomerAuditFieldChanges({
      old: { name: "Ahmed", email: "a@x.com" },
      new: { name: "Ahmed Ali", email: "a@x.com" },
    });
    assert.deepEqual(changes, [
      { field: "name", before: "Ahmed", after: "Ahmed Ali" },
    ]);
    assert.equal(
      extractCustomerAuditFieldChanges({ name: "only-top-level" }).length,
      0,
    );
  });

  it("maps actor to system when user_id missing", () => {
    const item = mapAuditLogToCustomerHistoryItem({
      row: {
        id: "a1",
        user_id: null,
        company_id: "co-a",
        action: "CREATE",
        entity: "customers",
        entity_id: "cust-1",
        metadata: { name: "X" },
        created_at: "2026-09-01T10:00:00.000Z",
      },
      customerId: "cust-1",
    });
    assert.equal(item.actorKind, "system");
    assert.equal(
      item.titleKey,
      "dashboard.customerWorkspace.history.events.customerCreated",
    );
  });

  it("title prefers phone change when phone before/after present", () => {
    const changes = extractCustomerAuditFieldChanges({
      old: { phone: "010" },
      new: { phone: "+2010" },
    });
    assert.equal(
      resolveCustomerAuditTitleKey({
        action: "UPDATE",
        entity: "customers",
        changes,
      }),
      "dashboard.customerWorkspace.history.events.customerPhoneChanged",
    );
  });

  it("pagination is stable newest-first and excludes unrelated rows by construction", () => {
    const items = sortCustomerAuditHistoryItems([
      mapAuditLogToCustomerHistoryItem({
        row: {
          id: "b",
          user_id: "u1",
          company_id: "co-a",
          action: "UPDATE",
          entity: "customers",
          entity_id: "cust-1",
          metadata: {},
          created_at: "2026-09-01T09:00:00.000Z",
        },
        customerId: "cust-1",
        actorName: "Omar",
      }),
      mapAuditLogToCustomerHistoryItem({
        row: {
          id: "a",
          user_id: "u1",
          company_id: "co-a",
          action: "CREATE",
          entity: "customers",
          entity_id: "cust-1",
          metadata: {},
          created_at: "2026-09-01T10:00:00.000Z",
        },
        customerId: "cust-1",
        actorName: "Omar",
      }),
    ]);
    assert.equal(items[0]?.id, "a");
    const page = paginateCustomerAuditHistoryItems(items, 1, 1);
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.id, "a");
  });

  it("history tab does not use global latest-N audit fetch", () => {
    const tab = readFileSync(
      join(
        __dirname,
        "../../components/customer-workspace/tabs/workspace-history-tab.tsx",
      ),
      "utf8",
    );
    assert.match(tab, /useCustomerAuditHistory/);
    assert.doesNotMatch(tab, /useAuditLogs/);
    const repo = readFileSync(
      join(__dirname, "customer-audit-history-repository.ts"),
      "utf8",
    );
    assert.match(repo, /\.eq\("company_id", companyId\)/);
    assert.match(repo, /\.eq\("customer_id", customerId\)/);
    assert.doesNotMatch(repo, /executeCampaign|processQueue|graph\.facebook/);
  });

  it("campaigns remain a separate feature contract", () => {
    assert.ok(WORKSPACE_TOP_TABS.includes("campaigns"));
    assert.ok(WORKSPACE_TOP_TABS.includes("history"));
    assert.notEqual(
      WORKSPACE_TOP_TABS.indexOf("campaigns"),
      WORKSPACE_TOP_TABS.indexOf("history"),
    );
  });
});
