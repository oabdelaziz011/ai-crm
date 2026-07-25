import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  probeWhatsAppPhoneNumberChannel,
  verifyWhatsAppPhoneNumberAccess,
} from "./whatsapp-phone-number-probe.js";

describe("whatsapp phone number probe", () => {
  it("accepts channels whose access token can read the phone number id", async () => {
    const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
      const auth = init?.headers instanceof Headers
        ? init.headers.get("Authorization")
        : (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth !== "Bearer token-a") {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      const url = String(input);
      assert.match(url, /1214681355059951\?fields=id$/);
      return new Response(JSON.stringify({ id: "1214681355059951" }), { status: 200 });
    };

    const match = await probeWhatsAppPhoneNumberChannel(
      "1214681355059951",
      [
        {
          id: "channel-a",
          companyId: "company-a",
          configuration: { accessToken: "token-a", apiVersion: "v21.0" },
        },
        {
          id: "channel-b",
          companyId: "company-b",
          configuration: { accessToken: "token-b", apiVersion: "v21.0" },
        },
      ],
      {
        fetchFn: fetchFn as typeof fetch,
      },
    );

    assert.equal(match?.id, "channel-a");
    assert.equal(
      await verifyWhatsAppPhoneNumberAccess(
        "1214681355059951",
        "token-a",
        "v21.0",
        fetchFn as typeof fetch,
      ),
      true,
    );
  });

  it("returns null when no channel owns the phone number id", async () => {
    const fetchFn = async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 });

    const match = await probeWhatsAppPhoneNumberChannel(
      "1214681355059951",
      [
        {
          id: "channel-a",
          companyId: "company-a",
          configuration: { accessToken: "token-a" },
        },
      ],
      { fetchFn: fetchFn as typeof fetch },
    );

    assert.equal(match, null);
  });
});
