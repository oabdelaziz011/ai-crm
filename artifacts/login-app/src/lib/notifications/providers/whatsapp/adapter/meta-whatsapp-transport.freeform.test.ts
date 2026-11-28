import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MetaWhatsAppTransport } from "./meta-whatsapp-transport";

describe("MetaWhatsAppTransport freeform vs template", () => {
  it("sends type text when templateId is null (active session freeform)", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const transport = new MetaWhatsAppTransport(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.freeform" }] }), {
        status: 200,
      });
    });

    const result = await transport.send(
      {
        to: "201011404109",
        templateKey: null,
        templateId: null,
        languageCode: "en_US",
        bodyParameters: [],
        fallbackText: "Order confirmed",
      },
      {
        accessToken: "token",
        phoneNumberId: "123",
        businessAccountId: "waba",
        webhookVerifyToken: "verify",
        defaultLanguage: "en",
      },
    );

    assert.equal(result.messageId, "wamid.freeform");
    assert.equal((calls[0]?.body as { type: string }).type, "text");
    assert.equal(
      (calls[0]?.body as { text: { body: string } }).text.body,
      "Order confirmed",
    );
  });

  it("sends type template when templateId is set", async () => {
    const calls: Array<{ body: unknown }> = [];
    const transport = new MetaWhatsAppTransport(async (_url, init) => {
      calls.push({ body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.tpl" }] }), { status: 200 });
    });

    await transport.send(
      {
        to: "201011404109",
        templateKey: "delivery_worker_dispatch",
        templateId: "valueor_delivery_worker_dispatch",
        languageCode: "en_US",
        bodyParameters: ["SO-1", "Omar", "Addr", "Phone", "100"],
        fallbackText: "",
      },
      {
        accessToken: "token",
        phoneNumberId: "123",
        businessAccountId: "waba",
        webhookVerifyToken: "verify",
        defaultLanguage: "en",
      },
    );

    assert.equal((calls[0]?.body as { type: string }).type, "template");
    assert.equal(
      (calls[0]?.body as { template: { name: string } }).template.name,
      "valueor_delivery_worker_dispatch",
    );
  });
});
