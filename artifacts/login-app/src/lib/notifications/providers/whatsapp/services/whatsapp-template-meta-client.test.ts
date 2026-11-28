import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listMetaWhatsAppMessageTemplates,
  WhatsAppTemplateMetaClientError,
} from "./whatsapp-template-meta-client";

describe("whatsapp-template-meta-client", () => {
  it("lists templates via Graph and follows paging", async () => {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "1",
                name: "hello_world",
                language: "en_US",
                status: "APPROVED",
                category: "UTILITY",
              },
            ],
            paging: { next: "https://graph.facebook.com/v21.0/next-page" },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "2",
              name: "valueor_order_confirmed",
              language: "en_US",
              status: "PENDING",
              category: "UTILITY",
            },
          ],
        }),
        { status: 200 },
      );
    };

    const listed = await listMetaWhatsAppMessageTemplates({
      accessToken: "token",
      businessAccountId: "waba-1",
      fetchFn: fetchFn as typeof fetch,
    });
    assert.equal(listed.length, 2);
    assert.equal(listed[0]?.name, "hello_world");
    assert.equal(listed[1]?.status, "PENDING");
    assert.equal(calls.length, 2);
  });

  it("rejects missing WABA / token", async () => {
    await assert.rejects(
      () =>
        listMetaWhatsAppMessageTemplates({
          accessToken: "",
          businessAccountId: "waba",
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateMetaClientError && err.code === "token_missing",
    );
  });

  it("rejects paging.next URLs that are not graph.facebook.com", async () => {
    await assert.rejects(
      () =>
        listMetaWhatsAppMessageTemplates({
          accessToken: "token",
          businessAccountId: "waba-1",
          maxAttempts: 1,
          fetchFn: async () =>
            new Response(
              JSON.stringify({
                data: [
                  {
                    id: "1",
                    name: "hello_world",
                    language: "en_US",
                    status: "APPROVED",
                  },
                ],
                paging: { next: "https://evil.example/steal" },
              }),
              { status: 200 },
            ),
        }),
      /graph\.facebook\.com/,
    );
  });

  it("maps Graph permission failures to WHATSAPP_TEMPLATE_META_PERMISSION", async () => {
    const { createMetaWhatsAppMessageTemplate } = await import(
      "./whatsapp-template-meta-client.ts"
    );
    const { WhatsAppTemplateSetupError } = await import("./whatsapp-template-setup-error.ts");
    await assert.rejects(
      () =>
        createMetaWhatsAppMessageTemplate({
          accessToken: "token",
          businessAccountId: "waba",
          name: "valueor_order_confirmed",
          language: "en_US",
          category: "UTILITY",
          bodyText: "Hi {{1}}",
          bodyExampleValues: ["Omar"],
          maxAttempts: 1,
          fetchFn: async () =>
            new Response(
              JSON.stringify({
                error: { message: "(#10) Application does not have permission", code: 10 },
              }),
              { status: 403 },
            ),
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateSetupError &&
        err.code === "WHATSAPP_TEMPLATE_META_PERMISSION",
    );
  });

  it("creates a template with BODY example payload", async () => {
    const { createMetaWhatsAppMessageTemplate } = await import(
      "./whatsapp-template-meta-client.ts"
    );
    let posted: unknown = null;
    const created = await createMetaWhatsAppMessageTemplate({
      accessToken: "token",
      businessAccountId: "waba",
      name: "valueor_order_confirmed",
      language: "en_US",
      category: "UTILITY",
      bodyText: "Hi {{1}}, order {{2}}",
      bodyExampleValues: ["Omar", "SO-1"],
      maxAttempts: 1,
      fetchFn: async (_url, init) => {
        posted = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({ id: "tpl-created", status: "PENDING", category: "UTILITY" }),
          { status: 200 },
        );
      },
    });
    assert.equal(created.id, "tpl-created");
    assert.equal(created.status, "PENDING");
    assert.equal((posted as { name: string }).name, "valueor_order_confirmed");
    assert.deepEqual(
      (posted as { components: Array<{ example?: { body_text: string[][] } }> }).components[0]
        ?.example?.body_text,
      [["Omar", "SO-1"]],
    );
  });
});
