import assert from "node:assert/strict";
import { describe, it } from "node:test";
import i18n from "@/i18n";
import { localizeNotification } from "@/lib/notification-i18n";
import { resolveNotificationHref } from "@/lib/notifications/resolve-notification-href";
import type { Notification } from "@/lib/notifications/types/notification-types";

function payload(messageKey: string, params: Record<string, string>) {
  return JSON.stringify({ messageKey, params });
}

function baseNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n1",
    companyId: "tenant-1",
    recipient: { userId: "u1", companyId: "tenant-1" },
    templateKey: "legacy",
    titleKey: "notifications.events.newCustomer.title",
    messagePayload: payload("notifications.events.newCustomer.message", {
      name: "Sara",
      customerId: "11111111-1111-1111-1111-111111111111",
      companyName: "Acme Travel",
      source: "website",
      navigationTarget: "/dashboard/customers/11111111-1111-1111-1111-111111111111",
    }),
    event: null,
    status: "delivered",
    priority: "normal",
    channel: "in_app",
    visualType: "info",
    category: "system",
    isRead: false,
    archivedAt: null,
    createdAt: "2026-10-29T00:00:00Z",
    ...overrides,
  };
}

describe("actionable notification content", () => {
  it("localizes customer notifications with organization and source", async () => {
    await i18n.changeLanguage("en");
    const result = localizeNotification(i18n.t.bind(i18n), {
      title_key: "notifications.events.newCustomer.title",
      message: payload("notifications.events.newCustomer.message", {
        name: "Sara",
        companyName: "Acme Travel",
        source: "website",
      }),
    });
    assert.match(result.message, /Sara/);
    assert.match(result.message, /Acme Travel/);
    assert.match(result.message, /website/);
  });

  it("localizes invoice paid notifications without raw UUID-only copy", async () => {
    await i18n.changeLanguage("en");
    const result = localizeNotification(i18n.t.bind(i18n), {
      title_key: "notifications.events.invoicePaid.title",
      message: payload("notifications.events.invoicePaid.message", {
        invoiceId: "22222222-2222-2222-2222-222222222222",
        invoiceNumber: "INV-1001",
        customerName: "Omar",
        amount: "120.00 USD",
      }),
    });
    assert.match(result.message, /INV-1001/);
    assert.match(result.message, /Omar/);
    assert.match(result.message, /120\.00 USD/);
    assert.doesNotMatch(result.message, /22222222-2222-2222-2222-222222222222/);
  });

  it("deep-links customer, invoice, and AI notifications", () => {
    const customerHref = resolveNotificationHref(baseNotification());
    assert.match(customerHref, /\/dashboard\/customers\/11111111-1111-1111-1111-111111111111/);

    const invoiceHref = resolveNotificationHref(
      baseNotification({
        titleKey: "notifications.events.invoicePaid.title",
        category: "invoice",
        messagePayload: payload("notifications.events.invoicePaid.message", {
          invoiceId: "22222222-2222-2222-2222-222222222222",
          invoiceNumber: "INV-1001",
        }),
      }),
    );
    assert.match(invoiceHref, /invoiceId=22222222-2222-2222-2222-222222222222/);

    const aiHref = resolveNotificationHref(
      baseNotification({
        titleKey: "notifications.events.aiTaskCompleted.title",
        messagePayload: payload("notifications.events.aiTaskCompleted.message", {
          detail: "Lead scoring finished",
          entityType: "ai_task",
          navigationTarget: "/dashboard/ai-analytics",
        }),
      }),
    );
    assert.match(aiHref, /ai-analytics/);
  });
});
