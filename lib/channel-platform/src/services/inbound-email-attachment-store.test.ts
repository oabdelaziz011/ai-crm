import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeInboundAttachmentBytes,
  isNonUserFacingInboundAttachment,
  materializeInboundEmailAttachments,
  sanitizeInboundAttachmentFilename,
  stashInboundAttachmentBytes,
  stripInboundAttachmentBinaries,
  type InboundAttachmentStorePort,
} from "./inbound-email-attachment-store.ts";
import type { ChannelAttachmentDto } from "../dto/channel-dto.ts";

describe("inbound email attachment store helpers", () => {
  it("sanitizes traversal and odd characters from filenames", () => {
    assert.equal(sanitizeInboundAttachmentFilename("../../etc/passwd.pdf"), "passwd.pdf");
    assert.equal(sanitizeInboundAttachmentFilename("invoice (1).pdf"), "invoice (1).pdf");
  });

  it("skips inline CID images and DSN parts from user-facing files", () => {
    assert.equal(
      isNonUserFacingInboundAttachment({ mimeType: "image/png", isInline: true, contentId: "logo@mail" }),
      true,
    );
    assert.equal(isNonUserFacingInboundAttachment({ mimeType: "message/delivery-status" }), true);
    assert.equal(isNonUserFacingInboundAttachment({ mimeType: "application/pdf" }), false);
  });

  it("round-trips stashed bytes and strips binaries from stored payloads", () => {
    const bytes = Buffer.from("hello-pdf");
    const contentRef = stashInboundAttachmentBytes(bytes);
    const decoded = decodeInboundAttachmentBytes({ contentRef });
    assert.equal(decoded?.toString(), "hello-pdf");

    const stripped = stripInboundAttachmentBinaries({
      kind: "email.inbound",
      attachments: [
        {
          filename: "a.pdf",
          metadata: { contentRef, contentBase64: "abc" },
          content: bytes,
        },
      ],
    });
    const attachment = (stripped.attachments as Array<Record<string, unknown>>)[0]!;
    assert.equal(attachment.content, undefined);
    assert.equal((attachment.metadata as Record<string, unknown>).contentRef, undefined);
    assert.equal((attachment.metadata as Record<string, unknown>).contentBase64, undefined);
  });

  it("uploads user-facing files and writes storagePath in outbound display shape", async () => {
    const stored: string[] = [];
    const store: InboundAttachmentStorePort = {
      async store(input) {
        stored.push(input.filename);
        return {
          id: "att-1",
          name: input.filename,
          storagePath: `${input.companyId}/${input.conversationId}/att-1-${input.filename}`,
          mimeType: input.mimeType,
          fileSize: input.content.length,
          kind: "pdf",
        };
      },
    };

    const contentRef = stashInboundAttachmentBytes(Buffer.from("%PDF-test"));
    const attachments: ChannelAttachmentDto[] = [
      {
        attachmentId: "a1",
        type: "document",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        metadata: { contentRef, fileSize: 9 },
      },
      {
        attachmentId: "inline",
        type: "image",
        filename: "logo.png",
        mimeType: "image/png",
        metadata: { isInline: true, contentId: "logo@cid", contentRef: stashInboundAttachmentBytes(Buffer.from("img")) },
      },
    ];

    const result = await materializeInboundEmailAttachments({
      companyId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      attachments,
      store,
    });

    assert.deepEqual(stored, ["invoice.pdf"]);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.filename, "invoice.pdf");
    assert.equal(
      result[0]?.metadata?.storagePath,
      "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/att-1-invoice.pdf",
    );
    assert.equal((result[0] as ChannelAttachmentDto & { storagePath?: string }).storagePath?.includes("invoice.pdf"), true);
  });

  it("keeps named chips when store is absent and never persists contentRef", async () => {
    const contentRef = stashInboundAttachmentBytes(Buffer.from("bytes"));
    const result = await materializeInboundEmailAttachments({
      companyId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      attachments: [
        {
          attachmentId: "a1",
          type: "document",
          filename: "notes.txt",
          mimeType: "text/plain",
          metadata: { contentRef },
        },
      ],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.filename, "notes.txt");
    assert.equal(result[0]?.metadata?.contentRef, undefined);
    assert.equal(result[0]?.metadata?.contentBase64, undefined);
  });
});
