import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EmailDeliveryLogRepository,
  resolveEmailDeliveryLogForeignKey,
} from "./email-delivery-log-repository.ts";
import type { EmailDeliveryResult } from "../types/email-types.ts";

describe("resolveEmailDeliveryLogForeignKey", () => {
  it("stores real notification queue UUIDs", () => {
    assert.equal(
      resolveEmailDeliveryLogForeignKey("6c162b02-5c88-4191-a961-1bd9d5d54518"),
      "6c162b02-5c88-4191-a961-1bd9d5d54518",
    );
  });

  it("nulls synthetic test/direct/template-test ids that are not UUIDs", () => {
    assert.equal(resolveEmailDeliveryLogForeignKey("test"), null);
    assert.equal(resolveEmailDeliveryLogForeignKey("direct"), null);
    assert.equal(resolveEmailDeliveryLogForeignKey("template-test:abc"), null);
    assert.equal(resolveEmailDeliveryLogForeignKey("not-a-uuid"), null);
    assert.equal(resolveEmailDeliveryLogForeignKey(""), null);
    assert.equal(resolveEmailDeliveryLogForeignKey(null), null);
  });
});

describe("EmailDeliveryLogRepository.append", () => {
  it("inserts queue_id null for test-connection sends and never writes secrets", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from() {
        return {
          insert(row: Record<string, unknown>) {
            inserted = row;
            return { error: null };
          },
        };
      },
    };

    const repo = new EmailDeliveryLogRepository(client as never);
    const result: EmailDeliveryResult = {
      queueId: "test",
      notificationId: null,
      companyId: "c6091971-f74f-4dcb-bf6f-18bbea1f4051",
      provider: "smtp",
      status: "completed",
      durationMs: 12,
      attempts: 1,
      lastError: null,
      recipientEmail: "qa@example.test",
      subject: "ValueOR SMTP test",
      timestamp: new Date().toISOString(),
    };

    await repo.append(result);

    assert.equal(inserted?.queue_id, null);
    assert.equal(inserted?.notification_id, null);
    assert.equal(inserted?.company_id, result.companyId);
    assert.equal(inserted?.recipient_email, "qa@example.test");
    assert.equal(inserted?.status, "completed");
    const serialized = JSON.stringify(inserted);
    assert.doesNotMatch(serialized, /password|app.?pass|secret|Bearer /i);
  });

  it("keeps UUID queue_id for real notification-queue deliveries", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from() {
        return {
          insert(row: Record<string, unknown>) {
            inserted = row;
            return { error: null };
          },
        };
      },
    };
    const repo = new EmailDeliveryLogRepository(client as never);
    await repo.append({
      queueId: "0f768fae-f746-c0ee-d4e6-515ef04027b2",
      notificationId: "97b8b045-d861-2af0-e41a-c4e45366e9fd",
      companyId: "c6091971-f74f-4dcb-bf6f-18bbea1f4051",
      provider: "smtp",
      status: "completed",
      durationMs: 8,
      attempts: 1,
      lastError: null,
      recipientEmail: "a@example.test",
      subject: "Hello",
      timestamp: new Date().toISOString(),
    });
    assert.equal(inserted?.queue_id, "0f768fae-f746-c0ee-d4e6-515ef04027b2");
    assert.equal(inserted?.notification_id, "97b8b045-d861-2af0-e41a-c4e45366e9fd");
  });
});
