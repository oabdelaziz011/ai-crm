import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ActivityQueryFailedError,
  CustomerNotFoundInTenantError,
} from "../../../../../lib/activity-timeline/src/errors.ts";
import {
  resolveCustomerWorkspaceCompanyId,
  resolveCustomerWorkspaceCompanyIdHint,
} from "./resolve-customer-workspace-company-id.ts";
import { WORKSPACE_TOP_TABS } from "./workspace-navigation.ts";
import { TIMELINE_FILTERS } from "../customer-timeline/timeline-filters.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("customer workspace company resolution", () => {
  it("uses customer.company_id as canonical tenant", () => {
    const result = resolveCustomerWorkspaceCompanyId({
      customerCompanyId: "co-customer",
      profileCompanyId: "co-customer",
      contextCompanyId: "co-stale",
      isSuperAdmin: false,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.companyId, "co-customer");
      assert.equal(result.source, "customer");
    }
  });

  it("rejects tenant mismatch for non-super-admin", () => {
    const result = resolveCustomerWorkspaceCompanyId({
      customerCompanyId: "co-a",
      profileCompanyId: "co-b",
      isSuperAdmin: false,
    });
    assert.deepEqual(result, { ok: false, reason: "tenant_mismatch" });
  });

  it("allows super-admin to use customer company across profile mismatch", () => {
    const result = resolveCustomerWorkspaceCompanyId({
      customerCompanyId: "co-a",
      profileCompanyId: "co-b",
      isSuperAdmin: true,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.companyId, "co-a");
  });

  it("fails closed when customer has no company_id", () => {
    const result = resolveCustomerWorkspaceCompanyId({
      customerCompanyId: null,
      profileCompanyId: "co-a",
      contextCompanyId: "co-a",
    });
    assert.deepEqual(result, { ok: false, reason: "missing_customer_company" });
  });

  it("hint may use context/profile before customer load", () => {
    assert.equal(
      resolveCustomerWorkspaceCompanyIdHint({
        profileCompanyId: "co-profile",
        contextCompanyId: "co-context",
      }),
      "co-context",
    );
  });
});

describe("activity errors", () => {
  it("exposes CUSTOMER_NOT_FOUND_IN_TENANT and ACTIVITY_QUERY_FAILED codes", () => {
    const missing = new CustomerNotFoundInTenantError();
    const failed = new ActivityQueryFailedError("boom");
    assert.equal(missing.code, "CUSTOMER_NOT_FOUND_IN_TENANT");
    assert.equal(failed.code, "ACTIVITY_QUERY_FAILED");
  });
});

describe("activity / campaigns / history separation", () => {
  it("keeps activity, campaigns, and history as distinct tabs", () => {
    assert.ok(WORKSPACE_TOP_TABS.includes("activity"));
    assert.ok(WORKSPACE_TOP_TABS.includes("campaigns"));
    assert.ok(WORKSPACE_TOP_TABS.includes("history"));
    assert.notEqual(
      WORKSPACE_TOP_TABS.indexOf("activity"),
      WORKSPACE_TOP_TABS.indexOf("campaigns"),
    );
    assert.notEqual(
      WORKSPACE_TOP_TABS.indexOf("activity"),
      WORKSPACE_TOP_TABS.indexOf("history"),
    );
  });

  it("activity filters do not include campaign lifecycle buckets", () => {
    assert.ok(!TIMELINE_FILTERS.includes("campaigns" as never));
    assert.ok(TIMELINE_FILTERS.includes("bookings"));
    assert.ok(TIMELINE_FILTERS.includes("tickets"));
  });
});

describe("activity source safety contracts", () => {
  it("does not register phone/email/notifications aggregators", () => {
    const indexSrc = readFileSync(
      join(__dirname, "../customer-timeline/aggregators/index.ts"),
      "utf8",
    );
    assert.doesNotMatch(indexSrc, /registerSource\(new WhatsAppDeliveryTimelineAggregator/);
    assert.doesNotMatch(indexSrc, /registerSource\(new EmailDeliveryTimelineAggregator/);
    assert.doesNotMatch(indexSrc, /registerSource\(new NotificationsTimelineAggregator/);
    assert.doesNotMatch(indexSrc, /import \{ WhatsAppDeliveryTimelineAggregator/);
    assert.doesNotMatch(indexSrc, /import \{ EmailDeliveryTimelineAggregator/);
    assert.doesNotMatch(indexSrc, /import \{ NotificationsTimelineAggregator/);
    assert.match(indexSrc, /BookingsTimelineProvider/);
    assert.match(indexSrc, /TicketsTimelineAggregator/);
    assert.match(indexSrc, /Campaign lifecycle remains on the Campaigns tab/);
  });

  it("unsafe aggregators are no-ops and forbid phone/email joins", () => {
    const wa = readFileSync(
      join(
        __dirname,
        "../customer-timeline/aggregators/whatsapp-delivery-timeline-aggregator.ts",
      ),
      "utf8",
    );
    const email = readFileSync(
      join(
        __dirname,
        "../customer-timeline/aggregators/email-delivery-timeline-aggregator.ts",
      ),
      "utf8",
    );
    const notes = readFileSync(
      join(
        __dirname,
        "../customer-timeline/aggregators/notifications-timeline-aggregator.ts",
      ),
      "utf8",
    );
    for (const src of [wa, email, notes]) {
      assert.match(src, /return \[\]/);
      assert.doesNotMatch(src, /\.eq\("phone"/);
      assert.doesNotMatch(src, /\.eq\("email"/);
      assert.doesNotMatch(src, /\.endsWith\(/);
      assert.doesNotMatch(src, /from\("whatsapp_delivery_logs"\)/);
      assert.doesNotMatch(src, /from\("email_delivery_logs"\)/);
      assert.doesNotMatch(src, /from\("notifications"\)/);
    }
  });

  it("entity access asserts company_id + customer id", () => {
    const src = readFileSync(
      join(__dirname, "../customer-timeline/customer-timeline-entity-access.ts"),
      "utf8",
    );
    assert.match(src, /CustomerNotFoundInTenantError/);
    assert.match(src, /\.eq\("company_id", scope\.companyId\)/);
    assert.match(src, /\.eq\("id", scope\.entityId\)/);
    assert.doesNotMatch(src, /phone|email|last.?9/);
  });

  it("workspace page resolves company from customer.company_id", () => {
    const page = readFileSync(
      join(
        __dirname,
        "../../pages/dashboard/customers/customer-workspace-page.tsx",
      ),
      "utf8",
    );
    assert.match(page, /resolveCustomerWorkspaceCompanyId/);
    assert.match(page, /customer\.company_id/);
    assert.doesNotMatch(
      page,
      /const companyId = context\?\.companyId \?\? profile\?\.company_id/,
    );
  });

  it("Arabic empty and not-found copy exist", () => {
    const ar = readFileSync(
      join(__dirname, "../../locales/ar/common.json"),
      "utf8",
    );
    assert.match(ar, /لا توجد أنشطة لهذا العميل حتى الآن/);
    assert.match(ar, /العميل غير موجود في هذه الشركة/);
    assert.match(ar, /جميع التفاعلات والأنشطة المرتبطة بهذا العميل/);
  });
});
