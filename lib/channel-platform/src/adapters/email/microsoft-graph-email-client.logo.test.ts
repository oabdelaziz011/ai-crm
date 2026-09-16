/**
 * Graph send uses HTML contentType when htmlSanitized payload includes identity logo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MicrosoftGraphEmailClient } from "./microsoft-graph-email-client.ts";

describe("microsoft graph email client identity logo HTML", () => {
  it("sends contentType HTML with body → logo → signature", async () => {
    let captured: Record<string, unknown> | null = null;
    const client = new MicrosoftGraphEmailClient({
      fetchImpl: (async (_url, init) => {
        captured = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(null, { status: 202 });
      }) as typeof fetch,
    });

    const html =
      '<p>Hello</p><div data-email-identity-logo="1"><img src="https://cdn.example/logo.png" alt="" width="160" /></div><div data-valueor-email-signature="1"><p>Sig</p></div>';

    await client.send(
      { accessToken: "token" },
      {
        to: "customer@example.com",
        subject: "Logo graph verify",
        text: "Hello\nSig",
        html,
      },
    );

    const message = captured?.message as Record<string, unknown>;
    const body = message?.body as { contentType?: string; content?: string };
    assert.equal(body?.contentType, "HTML");
    assert.match(String(body?.content), /data-email-identity-logo/);
    assert.match(String(body?.content), /https:\/\/cdn\.example\/logo\.png/);
    assert.ok(String(body?.content).indexOf("Hello") < String(body?.content).indexOf("logo"));
    assert.ok(String(body?.content).indexOf("logo") < String(body?.content).indexOf("Sig"));
  });
});
