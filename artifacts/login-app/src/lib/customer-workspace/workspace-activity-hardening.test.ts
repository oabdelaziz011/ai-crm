import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  automationContextBelongsToCustomer,
  buildAutomationCustomerOrFilter,
} from "../customer-timeline/aggregators/automation-customer-scope.ts";
import { WORKSPACE_TOP_TABS } from "./workspace-navigation.ts";
import {
  ActivityQueryFailedError,
  CustomerNotFoundInTenantError,
} from "../../../../../lib/activity-timeline/src/errors.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const timelineRoot = join(__dirname, "../customer-timeline");

function readTimeline(rel: string): string {
  return readFileSync(join(timelineRoot, rel), "utf8");
}

describe("automation customer scoping", () => {
  const customerA = "11111111-1111-4111-8111-111111111111";
  const customerB = "22222222-2222-4222-8222-222222222222";

  it("builds server-side OR filter for all four context paths", () => {
    const filter = buildAutomationCustomerOrFilter(customerA);
    assert.match(filter, new RegExp(`context->>customerId\\.eq\\.${customerA}`));
    assert.match(filter, new RegExp(`context->>customer_id\\.eq\\.${customerA}`));
    assert.match(filter, new RegExp(`context->params->>customerId\\.eq\\.${customerA}`));
    assert.match(filter, new RegExp(`context->params->>customer_id\\.eq\\.${customerA}`));
  });

  it("matches context.customerId / customer_id / params variants", () => {
    assert.equal(
      automationContextBelongsToCustomer({ customerId: customerA }, customerA),
      true,
    );
    assert.equal(
      automationContextBelongsToCustomer({ customer_id: customerA }, customerA),
      true,
    );
    assert.equal(
      automationContextBelongsToCustomer({ params: { customerId: customerA } }, customerA),
      true,
    );
    assert.equal(
      automationContextBelongsToCustomer({ params: { customer_id: customerA } }, customerA),
      true,
    );
  });

  it("excludes different customer and unlinked executions", () => {
    assert.equal(
      automationContextBelongsToCustomer({ customerId: customerB }, customerA),
      false,
    );
    assert.equal(automationContextBelongsToCustomer({ foo: "bar" }, customerA), false);
    assert.equal(automationContextBelongsToCustomer(null, customerA), false);
  });

  it("aggregator queries with company_id + or filter, not company latest-N only", () => {
    const src = readTimeline("aggregators/automation-executions-timeline-aggregator.ts");
    assert.match(src, /\.eq\("company_id", companyId\)/);
    assert.match(src, /buildAutomationCustomerOrFilter\(customerId\)/);
    assert.match(src, /\.or\(/);
    assert.doesNotMatch(src, /limit\(100\);\s*\n\s*if \(error \|\| !data\) return \[\];\s*\n\s*return data\s*\n\s*\.filter/);
    assert.doesNotMatch(src, /phone|last.?9|email/);
  });

  it("simulates >100 company-wide noise: only matching customer rows survive filter", () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      context:
        i === 119
          ? { customer_id: customerA }
          : i % 2 === 0
            ? { customerId: customerB }
            : { params: { customerId: customerB } },
    }));
    const matched = rows.filter((row) =>
      automationContextBelongsToCustomer(row.context, customerA),
    );
    assert.equal(matched.length, 1);
    assert.deepEqual(matched[0].context, { customer_id: customerA });
  });
});

describe("agent Activity — no audit_logs / no heuristics", () => {
  it("does not query audit_logs or synthesize customer_updated", () => {
    const src = readTimeline("providers/agent-activity-timeline-provider.ts");
    assert.doesNotMatch(src, /from\("audit_logs"\)/);
    assert.doesNotMatch(src, /type:\s*"customer_updated"/);
    assert.doesNotMatch(src, /customer\.updated_at/);
    assert.match(src, /fetchCustomerConversationIds\(/);
    assert.match(src, /companyId/);
    assert.match(src, /internal_note/);
  });
});

describe("conversation tenant scoping", () => {
  it("requires company_id + customer_id and fails closed without company", () => {
    const src = readTimeline("provider-utils.ts");
    assert.match(src, /\.eq\("customer_id", trimmedCustomerId\)/);
    assert.match(src, /\.eq\("company_id", trimmedCompanyId\)/);
    assert.match(src, /Fail closed/);
    assert.doesNotMatch(src, /if \(companyId\) \{\s*query = query\.eq\("company_id"/);
  });

  it("whatsapp and agent both pass companyId into conversation lookup", () => {
    const wa = readTimeline("providers/whatsapp-timeline-provider.ts");
    const agent = readTimeline("providers/agent-activity-timeline-provider.ts");
    assert.match(wa, /fetchCustomerConversationIds\(customerId, "whatsapp", companyId\)/);
    assert.match(agent, /fetchCustomerConversationIds\(\s*customerId,\s*undefined,\s*companyId/);
  });
});

describe("tickets Activity bridge access", () => {
  it("passes TimelineAccessContext into source.collect as access", () => {
    const bridge = readTimeline("adapters/activity-timeline-bridge.ts");
    assert.match(bridge, /access:\s*\{/);
    assert.match(bridge, /userId: extended\.userId/);
    assert.match(bridge, /hasPermission: extended\.hasPermission/);
  });

  it("tickets aggregator requires company + customer + access", () => {
    const src = readTimeline("aggregators/tickets-timeline-aggregator.ts");
    assert.match(src, /if \(!companyId \|\| !customerId \|\| !access\) return \[\]/);
    assert.match(src, /listCustomerTickets/);
    assert.match(src, /companyId/);
    assert.match(src, /customerId/);
    assert.doesNotMatch(src, /phone|email|last.?9/);
  });
});

describe("Activity / Campaigns / History separation", () => {
  it("keeps distinct tabs and excludes campaign/audit sources from Activity registry", () => {
    assert.ok(WORKSPACE_TOP_TABS.includes("activity"));
    assert.ok(WORKSPACE_TOP_TABS.includes("campaigns"));
    assert.ok(WORKSPACE_TOP_TABS.includes("history"));
    assert.equal(WORKSPACE_TOP_TABS.indexOf("campaigns") + 1, WORKSPACE_TOP_TABS.indexOf("history"));

    const index = readTimeline("aggregators/index.ts");
    assert.doesNotMatch(index, /marketing_campaign/);
    assert.match(index, /audit_logs/);
    assert.match(index, /Campaign lifecycle remains on the Campaigns tab/);
    assert.doesNotMatch(index, /registerSource\(new WhatsAppDelivery/);
  });

  it("active Activity sources never query marketing tables or audit_logs", () => {
    const files = [
      "aggregators/automation-executions-timeline-aggregator.ts",
      "aggregators/tickets-timeline-aggregator.ts",
      "providers/agent-activity-timeline-provider.ts",
      "providers/whatsapp-timeline-provider.ts",
      "providers/bookings-timeline-provider.ts",
      "providers/invoices-timeline-provider.ts",
      "providers/customer-lifecycle-provider.ts",
    ];
    for (const file of files) {
      const src = readTimeline(file);
      assert.doesNotMatch(src, /marketing_campaigns|marketing_campaign_recipients/);
      assert.doesNotMatch(src, /from\("audit_logs"\)/);
      assert.doesNotMatch(src, /\.eq\("phone"|last.?9|endsWith\(/);
    }
  });
});

describe("Activity empty / error codes", () => {
  it("preserves typed error codes", () => {
    assert.equal(new CustomerNotFoundInTenantError().code, "CUSTOMER_NOT_FOUND_IN_TENANT");
    assert.equal(new ActivityQueryFailedError().code, "ACTIVITY_QUERY_FAILED");
  });

  it("UI distinguishes empty vs not-found copy", () => {
    const ar = readFileSync(
      join(__dirname, "../../locales/ar/common.json"),
      "utf8",
    );
    assert.match(ar, /لا توجد أنشطة لهذا العميل حتى الآن/);
    assert.match(ar, /العميل غير موجود في هذه الشركة/);
    const panel = readTimeline("components/customer-timeline.tsx");
    assert.match(panel, /CustomerNotFoundInTenantError/);
    assert.match(panel, /ActivityQueryFailedError/);
    assert.match(panel, /emptyDescription/);
  });
});
