/**
 * Omnichannel Phase 2C — H3 signed URL hardening (login-app surface).
 * Run: node --experimental-strip-types --test artifacts/login-app/scripts/conversation-attachments-h3.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(projectRoot, rel), "utf8");
}

const attachmentService = read(
  "artifacts/login-app/src/lib/omnichannel/services/conversation-attachment-service.ts",
);
const messageMapper = read("artifacts/login-app/src/lib/omnichannel/aggregators/message-mapper.ts");
const teamInboxReply = read("artifacts/login-app/src/hooks/conversations/use-team-inbox-reply.ts");
const outboundPipeline = read("lib/channel-platform/src/pipelines/outbound-message-pipeline.ts");
const whatsappAdapter = read("lib/channel-platform/src/adapters/whatsapp/whatsapp-cloud-adapter.ts");
const messengerAdapter = read("lib/channel-platform/src/adapters/messenger/messenger-cloud-adapter.ts");
const instagramAdapter = read("lib/channel-platform/src/adapters/instagram/instagram-cloud-adapter.ts");
const emailAdapter = read("lib/channel-platform/src/adapters/email/email-cloud-adapter.ts");
const inboundPipeline = read("lib/channel-platform/src/pipelines/inbound-message-pipeline.ts");
const resolver = read("lib/channel-platform/src/services/conversation-attachment-url.ts");

describe("H3 login-app + outbound surface contracts", () => {
  it("new messages do not persist long-lived signed URLs", () => {
    assert.match(attachmentService, /attachmentUrl:\s*null/);
    assert.match(attachmentService, /storagePath:\s*attachment\.storagePath/);
    assert.doesNotMatch(
      attachmentService.slice(attachmentService.indexOf("buildAttachmentMessageFields")),
      /url:\s*attachment\.url/,
    );
  });

  it("message mapper prefers storagePath over persisted signed URL", () => {
    assert.match(messageMapper, /storagePath wins for internal objects/);
    assert.match(messageMapper, /url:\s*null/);
  });

  it("outbound dispatch maps storagePath without URL", () => {
    assert.match(teamInboxReply, /pipeline remints from storagePath/);
    assert.match(teamInboxReply, /url:\s*undefined/);
    assert.match(teamInboxReply, /storagePath:\s*attachment\.storagePath/);
  });

  it("outbound pipeline resolves before formatOutbound", () => {
    assert.match(outboundPipeline, /conversationAttachmentUrl\.resolveOutboundAttachments/);
    assert.match(outboundPipeline, /attachmentsForProvider/);
  });

  it("provider adapters remain Storage-unaware", () => {
    for (const src of [whatsappAdapter, messengerAdapter, instagramAdapter, emailAdapter]) {
      assert.doesNotMatch(src, /createSignedUrl/);
      assert.doesNotMatch(src, /conversationAttachmentUrl/);
      assert.doesNotMatch(src, /CONVERSATION_ATTACHMENTS_BUCKET/);
    }
  });

  it("inbound metadata builder untouched for media IDs", () => {
    assert.match(inboundPipeline, /function buildInboundIncomingMetadata/);
    assert.match(inboundPipeline, /attachments:\s*normalized\.attachments/);
    assert.doesNotMatch(inboundPipeline, /resolveConversationAttachmentUrl|createSignedUrl/);
  });

  it("TTL remains configurable with Meta window TBD", () => {
    assert.match(resolver, /Meta.*TBD|TBD.*Meta/i);
    assert.match(resolver, /CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS/);
    assert.match(resolver, /DEFAULT_CONVERSATION_ATTACHMENT_SIGNED_URL_SECONDS\s*=\s*60 \* 60 \* 24 \* 7/);
  });
});
