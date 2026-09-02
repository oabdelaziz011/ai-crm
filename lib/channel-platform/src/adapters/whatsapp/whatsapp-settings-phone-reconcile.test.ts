import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileCompanyWhatsAppPhoneNumberId } from "./whatsapp-settings-phone-reconcile.js";

describe("reconcileCompanyWhatsAppPhoneNumberId", () => {
  it("updates settings phone_number_id and syncs channel references", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const rpcs: string[] = [];
    let syncedChannelPhone: string | null = null;

    const client = {
      from(table: string) {
        assert.equal(table, "company_whatsapp_settings");
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      phone_number_id: "1168042419733416",
                      business_account_id: "1432514988716695",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            updates.push(patch);
            return {
              eq() {
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(row: Record<string, unknown>) {
            inserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      },
      rpc: async (name: string) => {
        rpcs.push(name);
        return { error: null };
      },
    };

    const result = await reconcileCompanyWhatsAppPhoneNumberId({
      client: client as never,
      companyId: "company-1",
      companyChannelId: "channel-1",
      phoneNumberId: "1285847481276306",
      syncChannelPhoneNumberId: async (_id, phoneNumberId) => {
        syncedChannelPhone = phoneNumberId;
      },
    });

    assert.equal(syncedChannelPhone, "1285847481276306");
    assert.deepEqual(updates, [{ phone_number_id: "1285847481276306" }]);
    assert.equal(inserts.length, 0);
    assert.deepEqual(rpcs, ["sync_whatsapp_channel_references"]);
    assert.equal(result.settingsUpdated, true);
    assert.equal(result.previousSettingsPhoneNumberId, "1168042419733416");
  });

  it("is a no-op on settings when phone already matches", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      phone_number_id: "1285847481276306",
                      business_account_id: "1419087680143420",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            updates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      },
      rpc: async () => ({ error: null }),
    };

    const result = await reconcileCompanyWhatsAppPhoneNumberId({
      client: client as never,
      companyId: "company-1",
      companyChannelId: "channel-1",
      phoneNumberId: "1285847481276306",
      syncChannelPhoneNumberId: async () => undefined,
    });

    assert.equal(updates.length, 0);
    assert.equal(result.settingsUpdated, false);
  });
});
