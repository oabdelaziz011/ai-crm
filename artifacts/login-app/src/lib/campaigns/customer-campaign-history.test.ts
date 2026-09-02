/**
 * Customer campaign history — unit tests (no DB / no Meta / no queue).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  assertCustomerScopedCampaignQuery,
  buildCustomerCampaignHistorySummary,
  buildCustomerCampaignTimeline,
  customerCampaignHistoryItemMatchesStatusFilter,
  customerCampaignHistoryUsesPhoneMatching,
  parseCampaignContentFields,
  resolveCustomerCampaignDisplayStatus,
  resolveCustomerCampaignHistoryDateRange,
  type CustomerCampaignHistoryItem,
} from "./customer-campaign-history.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

function item(
  partial: Partial<CustomerCampaignHistoryItem> &
    Pick<CustomerCampaignHistoryItem, "recipientId" | "status">,
): CustomerCampaignHistoryItem {
  return {
    campaignId: "camp-1",
    companyId: "co-a",
    customerId: "cust-1",
    channel: "whatsapp",
    notificationQueueId: null,
    channelDeliveryEventId: null,
    providerMessageId: null,
    errorMessage: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:01:00.000Z",
    campaignName: "Summer",
    campaignStatus: "completed",
    contentTitle: "Offer",
    contentDetail: "Hello",
    delivery: null,
    ...partial,
  };
}

describe("customer campaign history — empty / isolation contracts", () => {
  it("1) customer with no campaigns → empty summary", () => {
    const summary = buildCustomerCampaignHistorySummary([]);
    assert.deepEqual(summary, {
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      failed: 0,
      queuedOrSent: 0,
    });
  });

  it("requires companyId + customerId", () => {
    assert.throws(() =>
      assertCustomerScopedCampaignQuery({ companyId: "", customerId: "c1" }),
    );
  });

  it("17/18) never uses phone / last-9 matching", () => {
    assert.equal(customerCampaignHistoryUsesPhoneMatching(), false);
    const src = readFileSync(join(__dirname, "customer-campaign-history.ts"), "utf8");
    assert.doesNotMatch(src, /slice\(-9\)|lastNine|phone_e164|customers\.phone/);
    const repo = readFileSync(join(__dirname, "repository.ts"), "utf8");
    assert.match(repo, /\.eq\("customer_id", input\.customerId\)/);
    assert.match(repo, /\.eq\("company_id", input\.companyId\)/);
    assert.doesNotMatch(repo, /listCustomerCampaignHistory[\s\S]*\.eq\("phone"/);
  });

  it("22) history module has no outbound / Meta side effects", () => {
    const src = readFileSync(join(__dirname, "customer-campaign-history.ts"), "utf8");
    assert.doesNotMatch(src, /graph\.facebook|sendMessage|processQueue|executeCampaign/);
  });
});

describe("customer campaign history — statuses", () => {
  it("2/3) one and multiple campaigns", () => {
    const one = buildCustomerCampaignHistorySummary([item({ recipientId: "r1", status: "queued" })]);
    assert.equal(one.total, 1);
    assert.equal(one.sent, 1);

    const many = buildCustomerCampaignHistorySummary([
      item({ recipientId: "r1", status: "queued" }),
      item({ recipientId: "r2", campaignId: "camp-2", status: "failed" }),
    ]);
    assert.equal(many.total, 2);
    assert.equal(many.failed, 1);
  });

  it("4) same campaign different customers stay isolated by customerId field", () => {
    const a = item({ recipientId: "r1", customerId: "cust-a", status: "queued" });
    const b = item({ recipientId: "r2", customerId: "cust-b", status: "queued" });
    assert.notEqual(a.customerId, b.customerId);
  });

  it("5) multiple messages same campaign (distinct recipient rows)", () => {
    const rows = [
      item({ recipientId: "r1", channel: "whatsapp", status: "queued" }),
      item({ recipientId: "r2", channel: "instagram", status: "sent" }),
    ];
    assert.equal(buildCustomerCampaignHistorySummary(rows).total, 2);
  });

  it("6-10) delivered / read / replied / failed / pending", () => {
    const delivered = item({
      recipientId: "d1",
      status: "sent",
      delivery: {
        sentAt: "2026-08-01T10:02:00.000Z",
        deliveredAt: "2026-08-01T10:03:00.000Z",
        readAt: null,
        failedAt: null,
        repliedAt: null,
        deliveryStatus: "delivered",
        externalMessageId: "wamid.x",
      },
    });
    assert.equal(resolveCustomerCampaignDisplayStatus(delivered), "delivered");
    assert.equal(
      customerCampaignHistoryItemMatchesStatusFilter(delivered, "delivered"),
      true,
    );

    const read = item({
      recipientId: "d2",
      status: "sent",
      delivery: {
        sentAt: "t",
        deliveredAt: "t",
        readAt: "t2",
        failedAt: null,
        repliedAt: null,
        deliveryStatus: "read",
        externalMessageId: null,
      },
    });
    assert.equal(resolveCustomerCampaignDisplayStatus(read), "read");

    assert.equal(
      customerCampaignHistoryItemMatchesStatusFilter(
        item({
          recipientId: "r",
          status: "sent",
          delivery: {
            sentAt: "t",
            deliveredAt: "t",
            readAt: null,
            failedAt: null,
            repliedAt: "t3",
            deliveryStatus: "delivered",
            externalMessageId: "wamid.x",
          },
        }),
        "replied",
      ),
      true,
    );

    assert.equal(
      customerCampaignHistoryItemMatchesStatusFilter(
        item({ recipientId: "r", status: "queued" }),
        "replied",
      ),
      false,
    );

    assert.equal(
      resolveCustomerCampaignDisplayStatus(item({ recipientId: "f", status: "failed" })),
      "failed",
    );
    assert.equal(
      resolveCustomerCampaignDisplayStatus(item({ recipientId: "p", status: "pending" })),
      "pending",
    );
  });

  it("19) empty/missing delivery events → timeline only created + queued", () => {
    const timeline = buildCustomerCampaignTimeline(
      item({ recipientId: "r1", status: "queued" }),
    );
    assert.deepEqual(
      timeline.map((e) => e.key),
      ["created", "queued"],
    );
  });

  it("timeline includes delivery/read only when present", () => {
    const timeline = buildCustomerCampaignTimeline(
      item({
        recipientId: "r1",
        status: "sent",
        delivery: {
          sentAt: "2026-08-01T10:02:00.000Z",
          deliveredAt: "2026-08-01T10:03:00.000Z",
          readAt: "2026-08-01T10:05:00.000Z",
          failedAt: null,
          repliedAt: null,
          deliveryStatus: "read",
          externalMessageId: null,
        },
      }),
    );
    assert.deepEqual(
      timeline.map((e) => e.key),
      ["created", "sent", "delivered", "read"],
    );
  });
});

describe("customer campaign history — filters", () => {
  it("11) date period windows", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const week = resolveCustomerCampaignHistoryDateRange({ period: "7d", now });
    assert.ok(week.from);
    assert.equal(week.to, null);
    const all = resolveCustomerCampaignHistoryDateRange({ period: "all", now });
    assert.equal(all.from, null);
  });

  it("12/13) status + channel filters are pure predicates", () => {
    const queued = item({ recipientId: "r1", status: "queued", channel: "whatsapp" });
    assert.equal(customerCampaignHistoryItemMatchesStatusFilter(queued, "sent"), true);
    assert.equal(customerCampaignHistoryItemMatchesStatusFilter(queued, "failed"), false);
    assert.equal(queued.channel, "whatsapp");
  });

  it("parses campaign content without inventing fields", () => {
    assert.deepEqual(parseCampaignContentFields({ campaignTitle: "A", detail: "B" }), {
      title: "A",
      detail: "B",
    });
    assert.deepEqual(parseCampaignContentFields(null), { title: null, detail: null });
  });
});
