import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MicrosoftGraphEmailClient,
  mapGraphAttachments,
  mapGraphMessageToInboundRecord,
} from "./microsoft-graph-email-client.ts";

describe("microsoft graph inbound attachments", () => {
  it("maps file attachments and skips item attachments", () => {
    const mapped = mapGraphAttachments([
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: "quote.pdf",
        contentType: "application/pdf",
        size: 24,
        contentBytes: Buffer.from("pdf-bytes").toString("base64"),
        isInline: false,
      },
      {
        "@odata.type": "#microsoft.graph.itemAttachment",
        name: "embedded.msg",
      },
    ]);
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0]?.filename, "quote.pdf");
    assert.equal(mapped[0]?.mimeType, "application/pdf");
    assert.ok(typeof mapped[0]?.contentBase64 === "string");
  });

  it("includes mapped attachments on inbound records", () => {
    const record = mapGraphMessageToInboundRecord({
      id: "AAMk",
      internetMessageId: "<msg@outlook.com>",
      conversationId: "conv-1",
      subject: "Quote",
      body: { contentType: "HTML", content: "<p>Hi</p>" },
      from: { emailAddress: { address: "from@contoso.com", name: "From" } },
      toRecipients: [{ emailAddress: { address: "to@contoso.com" } }],
      ccRecipients: [],
      internetMessageHeaders: [],
      attachments: [
        {
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: "quote.pdf",
          contentType: "application/pdf",
          contentBytes: Buffer.from("pdf-bytes").toString("base64"),
        },
      ],
    });
    assert.equal((record.attachments as unknown[]).length, 1);
    assert.equal((record.attachments as Array<{ filename: string }>)[0]?.filename, "quote.pdf");
  });

  it("fetches Graph file attachments including $value fallback", async () => {
    const calls: string[] = [];
    const client = new MicrosoftGraphEmailClient({
      graphBaseUrl: "https://graph.microsoft.com/v1.0",
      fetchImpl: (async (url) => {
        const href = String(url);
        calls.push(href);
        if (href.endsWith("/attachments") && !href.includes("$value")) {
          return new Response(
            JSON.stringify({
              value: [
                {
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  id: "att-1",
                  name: "spec.docx",
                  contentType:
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  size: 5,
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (href.endsWith("/$value")) {
          return new Response(Buffer.from("docx!"), { status: 200 });
        }
        return new Response("no", { status: 404 });
      }) as typeof fetch,
    });

    const attachments = await client.listMessageAttachments({ accessToken: "token" }, "MSG-1");
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.filename, "spec.docx");
    assert.equal(attachments[0]?.contentBase64, Buffer.from("docx!").toString("base64"));
    assert.ok(calls.some((url) => url.includes("/messages/MSG-1/attachments")));
    assert.ok(calls.some((url) => url.includes("/$value")));
  });
});
