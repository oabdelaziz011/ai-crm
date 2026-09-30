import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WhatsAppDeliveryLogRepository,
  mapWhatsAppDeliveryLogRowsToSummary,
  resolveWhatsAppSettingsAuthError,
} from "./whatsapp-delivery-log-repository.ts";
import type { WhatsAppDeliveryResult } from "../types/whatsapp-types.ts";

describe("mapWhatsAppDeliveryLogRowsToSummary", () => {
  it("A+D: historical failed delivery is delivery history, not current auth state", () => {
    const summary = mapWhatsAppDeliveryLogRowsToSummary([
      {
        created_at: "2026-08-30T19:03:49.709Z",
        status: "failed",
        last_error: "Authentication Error",
      },
    ]);

    assert.equal(summary.lastDeliveryStatus, "failed");
    assert.equal(summary.lastDeliveryError, "Authentication Error");
    assert.equal(summary.lastDeliveryAt, "2026-08-30T19:03:49.709Z");
    assert.equal(summary.recentFailureCount, 1);

    // Healthy credentials + successful connection must not inherit delivery error as auth.
    const authError = resolveWhatsAppSettingsAuthError({
      settingsLastAuthError: null,
      latestConnectionTest: { ok: true, error: null },
      healthOk: true,
      healthError: null,
    });
    assert.equal(authError, null);
  });

  it("B: current authentication failure is still shown from credential lifecycle", () => {
    const authError = resolveWhatsAppSettingsAuthError({
      settingsLastAuthError: "Authentication Error",
      latestConnectionTest: null,
      healthOk: true,
      healthError: null,
    });
    assert.equal(authError, "Authentication Error");

    const fromLiveProbe = resolveWhatsAppSettingsAuthError({
      settingsLastAuthError: null,
      latestConnectionTest: { ok: false, error: "Error validating access token" },
      healthOk: false,
      healthError: "Error validating access token",
    });
    assert.equal(fromLiveProbe, "Error validating access token");
  });

  it("D: successful connection clears auth display even when settings still hold old auth text", () => {
    const authError = resolveWhatsAppSettingsAuthError({
      settingsLastAuthError: "Authentication Error",
      latestConnectionTest: { ok: true, error: null },
      healthOk: true,
      healthError: null,
    });
    assert.equal(authError, null);
  });

  it("does not treat a completed latest delivery as a delivery error", () => {
    const summary = mapWhatsAppDeliveryLogRowsToSummary([
      {
        created_at: "2026-09-18T12:00:00.000Z",
        status: "completed",
        last_error: null,
      },
      {
        created_at: "2026-08-30T19:03:49.709Z",
        status: "failed",
        last_error: "Authentication Error",
      },
    ]);
    assert.equal(summary.lastDeliveryStatus, "completed");
    assert.equal(summary.lastDeliveryError, null);
    assert.equal(summary.recentFailureCount, 1);
  });
});

describe("WhatsAppDeliveryLogRepository", () => {
  it("E: append preserves delivery-log write behavior (no delete/mutate of history)", async () => {
    let inserted: Record<string, unknown> | null = null;
    const client = {
      from(table: string) {
        assert.equal(table, "whatsapp_delivery_logs");
        return {
          insert(row: Record<string, unknown>) {
            inserted = row;
            return { error: null };
          },
        };
      },
    };

    const repo = new WhatsAppDeliveryLogRepository(client as never);
    const result: WhatsAppDeliveryResult = {
      queueId: "d6089e0b-bf03-47b1-9a16-aef4a8405c7f",
      notificationId: "03912457-fdbb-493d-8422-d64f02e11aa1",
      companyId: "2d27f7fb-c15e-4d60-84e9-1793f36f2172",
      provider: "meta_cloud",
      status: "failed",
      durationMs: 1040,
      attempts: 1,
      lastError: "Authentication Error",
      recipientPhone: null,
      messageId: null,
      templateKey: null,
      timestamp: "2026-08-30T19:03:49.709Z",
    };

    await repo.append(result);

    assert.equal(inserted?.status, "failed");
    assert.equal(inserted?.last_error, "Authentication Error");
    assert.equal(inserted?.company_id, result.companyId);
    assert.equal(inserted?.queue_id, result.queueId);
  });

  it("C: latestDeliverySummary remains queryable and preserves historical failure rows", async () => {
    const historical = {
      created_at: "2026-08-30T19:03:49.709Z",
      status: "failed",
      last_error: "Authentication Error",
    };
    let deleted = false;
    let updated = false;

    const client = {
      from(table: string) {
        assert.equal(table, "whatsapp_delivery_logs");
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return { data: [historical], error: null };
                      },
                    };
                  },
                };
              },
            };
          },
          delete() {
            deleted = true;
            return { error: null };
          },
          update() {
            updated = true;
            return { error: null };
          },
        };
      },
    };

    const repo = new WhatsAppDeliveryLogRepository(client as never);
    const summary = await repo.latestDeliverySummary("2d27f7fb-c15e-4d60-84e9-1793f36f2172");

    assert.equal(summary.lastDeliveryError, "Authentication Error");
    assert.equal(summary.lastDeliveryStatus, "failed");
    assert.equal(summary.lastDeliveryAt, historical.created_at);
    assert.equal(deleted, false);
    assert.equal(updated, false);
  });
});
