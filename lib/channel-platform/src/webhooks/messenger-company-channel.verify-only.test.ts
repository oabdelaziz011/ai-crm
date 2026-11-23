import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMessengerCompanyChannel } from "./messenger-company-channel.js";

describe("resolveMessengerCompanyChannel pending / verify-only", () => {
  it("uses decrypted verify token when access token is absent (pending channel)", async () => {
    const result = await resolveMessengerCompanyChannel(
      {
        registry: {
          getCompanyChannel: async () => ({
            id: "cc-pending",
            companyId: "co-1",
            channelKey: "messenger",
            displayName: "Messenger",
            isEnabled: false,
            provider: "meta_messenger",
            configuration: { credentialsSource: "company_messenger_settings" },
          }),
        },
      } as never,
      "cc-pending",
      {
        loadByCompanyId: async () => ({
          pageId: "",
          accessToken: "",
          verifyToken: "messenger_verify_pendingonlytoken000111",
          apiVersion: "v21.0",
          enabled: false,
        }),
      },
    );

    assert.equal(result.companyId, "co-1");
    assert.equal(result.verifyToken, "messenger_verify_pendingonlytoken000111");
  });

  it("fails closed when neither decrypted nor legacy verify token exists", async () => {
    await assert.rejects(
      () =>
        resolveMessengerCompanyChannel(
          {
            registry: {
              getCompanyChannel: async () => ({
                id: "cc-pending",
                companyId: "co-1",
                channelKey: "messenger",
                displayName: "Messenger",
                isEnabled: false,
                provider: "meta_messenger",
                configuration: {},
              }),
            },
          } as never,
          "cc-pending",
          {
            loadByCompanyId: async () => ({
              pageId: "",
              accessToken: "",
              verifyToken: "",
              apiVersion: "v21.0",
              enabled: false,
            }),
          },
        ),
      /verify token is not configured/i,
    );
  });
});
