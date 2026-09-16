import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendSignatureOnce } from "./email-signature-text.ts";
import {
  buildEmailComposerDraftPatch,
  readEmailComposerDraft,
} from "./email-thread-outbound.ts";

describe("email composer draft restore", () => {
  it("restores exact draft body, recipients, and subject after metadata reload", () => {
    const persisted = buildEmailComposerDraftPatch(
      { emailRoutingClassification: { category: "billing" } },
      {
        mode: "reply",
        to: ["customer.e2e@example.test"],
        cc: ["cc.e2e@valueor-test.local"],
        bcc: [],
        subject: "Re: URGENT payment",
        body: "Closure draft — please keep this exact text.",
        updatedAt: "2026-09-11T00:00:00.000Z",
        attachments: [
          {
            id: "att-draft-1",
            name: "test-attachment.txt",
            storagePath:
              "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/att-draft-1-test-attachment.txt",
            mimeType: "text/plain",
            fileSize: 12,
            kind: "txt",
          },
        ],
      },
    );

    const restored = readEmailComposerDraft(persisted);
    assert.ok(restored);
    assert.equal(restored?.body, "Closure draft — please keep this exact text.");
    assert.deepEqual(restored?.to, ["customer.e2e@example.test"]);
    assert.deepEqual(restored?.cc, ["cc.e2e@valueor-test.local"]);
    assert.equal(restored?.subject, "Re: URGENT payment");
    assert.equal(restored?.mode, "reply");
    assert.equal(restored?.attachments.length, 1);
    assert.equal(restored?.attachments[0]?.name, "test-attachment.txt");
    assert.equal(restored?.attachments[0]?.storagePath.includes(".."), false);
    assert.deepEqual(
      (persisted as { emailRoutingClassification: { category: string } }).emailRoutingClassification,
      { category: "billing" },
    );
  });

  it("restores a New Email compose draft including cc/bcc and attachments", () => {
    const persisted = buildEmailComposerDraftPatch(
      { emailComposeOrigin: "new_email" },
      {
        mode: "compose",
        to: ["prospect@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Introduction",
        body: "Hello from ValueOR",
        updatedAt: "2026-09-11T00:00:00.000Z",
        attachments: [
          {
            id: "att-compose-1",
            name: "intro.txt",
            storagePath:
              "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/att-compose-1-intro.txt",
            mimeType: "text/plain",
            fileSize: 8,
            kind: "txt",
          },
        ],
      },
    );
    const restored = readEmailComposerDraft(persisted);
    assert.equal(restored?.mode, "compose");
    assert.deepEqual(restored?.to, ["prospect@example.com"]);
    assert.deepEqual(restored?.cc, ["cc@example.com"]);
    assert.deepEqual(restored?.bcc, ["bcc@example.com"]);
    assert.equal(restored?.subject, "Introduction");
    assert.equal(restored?.body, "Hello from ValueOR");
    assert.equal(restored?.attachments[0]?.name, "intro.txt");
  });

  it("does not duplicate a company signature already present in the draft", () => {
    const signature = "Best regards,\nValueOR Support";
    const body = appendSignatureOnce("Thanks for waiting.", signature);
    const again = appendSignatureOnce(body, signature);
    assert.equal(again, body);
    assert.equal(again.split(signature).length - 1, 1);
  });
});
