import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCompanyMessengerCredentialsDecrypted } from "./messenger-canonical-credentials.js";

describe("loadCompanyMessengerCredentialsDecrypted verify-only", () => {
  it("returns credentials when decrypted RPC has verify token but no access token", async () => {
    const client = {
      rpc: async () => ({
        data: {
          enabled: false,
          access_token: "",
          page_id: "",
          webhook_verify_token: "messenger_verify_pendingonlytoken000111",
          api_version: "v21.0",
          app_secret: "",
        },
        error: null,
      }),
      from: () => {
        throw new Error("table fallback should not run when verify token is present");
      },
    };

    const loaded = await loadCompanyMessengerCredentialsDecrypted(client as never, "co-1");
    assert.ok(loaded);
    assert.equal(loaded?.accessToken, "");
    assert.equal(loaded?.verifyToken, "messenger_verify_pendingonlytoken000111");
    assert.equal(loaded?.enabled, false);
  });

  it("does not invent credentials when decrypted RPC is empty", async () => {
    const client = {
      rpc: async () => ({
        data: {
          enabled: false,
          access_token: "",
          page_id: "",
          webhook_verify_token: "",
          api_version: "v21.0",
          app_secret: "",
        },
        error: null,
      }),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    const loaded = await loadCompanyMessengerCredentialsDecrypted(client as never, "co-1");
    assert.equal(loaded, null);
  });
});
