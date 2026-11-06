import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachmentPathOwnedBy,
  authorizeAttachmentConversation,
  buildAttachmentObjectPath,
  decideAttachmentRead,
  MOBILE_ATTACHMENT_BUCKET,
  validateAttachmentDescriptor,
} from "./mobile-attachments.js";

const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherCompanyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const conversationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("mobile attachment authorization", () => {
  it("accepts a bucket file type and rejects an oversized or executable file", () => {
    const pdf = validateAttachmentDescriptor({ bytes: 1200, mime: "application/pdf", fileName: "note.pdf" });
    assert.equal(pdf.ok, true);
    const huge = validateAttachmentDescriptor({ bytes: 26_214_401, mime: "image/jpeg", fileName: "big.jpg" });
    assert.equal(huge.ok, false);
    if (!huge.ok) assert.equal(huge.status, 400);
    const exe = validateAttachmentDescriptor({ bytes: 100, mime: "application/x-msdownload", fileName: "run.exe" });
    assert.equal(exe.ok, false);
  });

  it("builds a company and conversation path and rejects another tenant's path", () => {
    const path = buildAttachmentObjectPath({
      companyId,
      conversationId,
      objectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      fileName: "photo.jpg",
    });
    assert.equal(path.startsWith(`${companyId}/${conversationId}/`), true);
    assert.equal(MOBILE_ATTACHMENT_BUCKET, "conversation-attachments");
    assert.equal(attachmentPathOwnedBy(path, companyId, conversationId), true);
    assert.equal(attachmentPathOwnedBy(`${otherCompanyId}/${conversationId}/file.pdf`, companyId, conversationId), false);
    assert.equal(attachmentPathOwnedBy(`${companyId}/${conversationId}/../secret.pdf`, companyId, conversationId), false);
  });

  it("hides a conversation from another company and blocks upload without reply permission", () => {
    const foreign = authorizeAttachmentConversation({
      sessionCompanyId: companyId,
      conversation: { id: conversationId, companyId: otherCompanyId },
      canReply: true,
      needsReply: true,
    });
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 404);
      assert.equal(foreign.message.includes(otherCompanyId), false);
    }
    const denied = authorizeAttachmentConversation({
      sessionCompanyId: companyId,
      conversation: { id: conversationId, companyId },
      canReply: false,
      needsReply: true,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "forbidden");
    const claimed = authorizeAttachmentConversation({
      sessionCompanyId: companyId,
      claimedCompanyId: otherCompanyId,
      conversation: { id: conversationId, companyId },
      canReply: true,
      needsReply: true,
    });
    assert.equal(claimed.ok, false);
    if (!claimed.ok) assert.equal(claimed.code, "cross_tenant");
  });

  it("returns 403 before lookup when read permission is missing and 404 for another company", () => {
    const unread = decideAttachmentRead({
      canRead: false,
      sessionCompanyId: companyId,
      conversation: { id: conversationId, companyId },
    });
    assert.equal(unread.ok, false);
    if (!unread.ok) {
      assert.equal(unread.status, 403);
      assert.equal(unread.code, "forbidden");
    }
    const hidden = decideAttachmentRead({
      canRead: true,
      sessionCompanyId: companyId,
      conversation: null,
    });
    assert.equal(hidden.ok, false);
    if (!hidden.ok) assert.equal(hidden.status, 404);
    const foreign = decideAttachmentRead({
      canRead: true,
      sessionCompanyId: companyId,
      conversation: { id: conversationId, companyId: otherCompanyId },
    });
    assert.equal(foreign.ok, false);
    if (!foreign.ok) {
      assert.equal(foreign.status, 404);
      assert.equal(foreign.message.includes(otherCompanyId), false);
    }
  });
});
