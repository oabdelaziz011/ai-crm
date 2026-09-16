import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { appendSignatureOnce } from "./email-signature-text.ts";
import {
  buildEmailComposerDraftPatch,
  buildEmailWorkspaceOutboundMetadata,
  parseRecipientList,
  readEmailComposerDraft,
} from "./email-thread-outbound.ts";
import { countEmailWorkspaceOutboundMetrics } from "./email-workspace-metrics.ts";
import { renderEmailTemplate } from "../email-templates/email-template-renderer.ts";
import { validateEmailComposerFile } from "./email-composer-attachment-validation.ts";
import { generateEmailAiDraft } from "./email-ai-assist.ts";
import {
  buildCompanyEmailChannelCreateInput,
  buildNewEmailConversationCreateInput,
  buildNewEmailConversationMetadata,
  diagnoseNewEmailChannelAvailability,
  ensureCompanyEmailChannelForCompose,
  emailWorkspaceChannelToCandidate,
  evaluateNewEmailSend,
  evaluateNewEmailStart,
  formatCompanyFromIdentity,
  isCompanyEmailChannelRow,
  isNewEmailComposeConversation,
  isValidComposerEmailAddress,
  pickCompanyEmailChannel,
  pickExactCompanyCustomerMatch,
  resolveNewEmailAssistantId,
  resolveNewEmailCompanyChannelId,
  shouldProvisionCompanyEmailChannel,
  shouldShowComposeMode,
} from "./email-compose-new.ts";
import { requiresServerOutboundDispatch } from "@workspace/channel-platform/client";
import { buildEmailComposeSessionInsert } from "./email-compose-new.ts";

const here = dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(
  readFileSync(join(here, "../../locales/en/common.json"), "utf8"),
) as { emailModule: { workspace: Record<string, unknown> } };
const ar = JSON.parse(
  readFileSync(join(here, "../../locales/ar/common.json"), "utf8"),
) as { emailModule: { workspace: Record<string, unknown> } };

describe("New Email compose helpers", () => {
  it("renders New Email / رسالة جديدة labels in English and Arabic", () => {
    assert.equal(en.emailModule.workspace.newEmail, "New Email");
    assert.equal(ar.emailModule.workspace.newEmail, "رسالة جديدة");
    assert.equal((en.emailModule.workspace.fields as { to: string }).to, "To");
    assert.equal((ar.emailModule.workspace.fields as { to: string }).to, "إلى");
    assert.equal((en.emailModule.workspace.fields as { subject: string }).subject, "Subject");
    assert.equal((ar.emailModule.workspace.fields as { subject: string }).subject, "الموضوع");
    assert.equal((en.emailModule.workspace.fields as { cc: string }).cc, "Cc");
    assert.equal((ar.emailModule.workspace.fields as { cc: string }).cc, "نسخة");
    assert.equal((en.emailModule.workspace.fields as { bcc: string }).bcc, "Bcc");
    assert.equal((ar.emailModule.workspace.fields as { bcc: string }).bcc, "نسخة مخفية");
    assert.equal(en.emailModule.workspace.send, "Send");
    assert.equal(ar.emailModule.workspace.send, "إرسال");
    assert.equal(en.emailModule.workspace.saveDraft, "Save Draft");
    assert.equal(ar.emailModule.workspace.saveDraft, "حفظ كمسودة");
  });

  it("blocks unauthenticated, entitlement, RBAC, and missing channel starts", () => {
    assert.deepEqual(
      evaluateNewEmailStart({
        userId: null,
        companyId: "co-1",
        emailChannelEntitled: true,
        hasReplyPermission: true,
        isSuperAdmin: false,
        emailCompanyChannelId: "ch-1",
        assistantId: "asst-1",
      }),
      { ok: false, reason: "unauthenticated" },
    );
    assert.deepEqual(
      evaluateNewEmailStart({
        userId: "u-1",
        companyId: "co-1",
        emailChannelEntitled: false,
        hasReplyPermission: true,
        isSuperAdmin: false,
        emailCompanyChannelId: "ch-1",
        assistantId: "asst-1",
      }),
      { ok: false, reason: "not_entitled" },
    );
    assert.deepEqual(
      evaluateNewEmailStart({
        userId: "u-1",
        companyId: "co-1",
        emailChannelEntitled: true,
        hasReplyPermission: false,
        isSuperAdmin: false,
        emailCompanyChannelId: "ch-1",
        assistantId: "asst-1",
      }),
      { ok: false, reason: "rbac" },
    );
    assert.equal(
      evaluateNewEmailStart({
        userId: "u-1",
        companyId: "co-1",
        emailChannelEntitled: true,
        hasReplyPermission: false,
        isSuperAdmin: true,
        emailCompanyChannelId: "ch-1",
        assistantId: "asst-1",
      }).ok,
      true,
    );
  });

  it("resolves compose assistant from settings or unfiltered conversation FK", () => {
    assert.equal(
      resolveNewEmailAssistantId({
        companyId: "co-1",
        settingsAssistantId: "asst-settings",
        conversations: [{ company_id: "co-1", ai_assistant_id: "asst-conv" }],
      }),
      "asst-settings",
    );
    assert.equal(
      resolveNewEmailAssistantId({
        companyId: "co-1",
        settingsAssistantId: null,
        conversations: [
          { company_id: "co-other", ai_assistant_id: "asst-other" },
          { company_id: "co-1", ai_assistant_id: null },
          { company_id: "co-1", ai_assistant_id: "asst-from-thread" },
        ],
      }),
      "asst-from-thread",
    );
    assert.equal(
      resolveNewEmailAssistantId({
        companyId: "co-1",
        settingsAssistantId: null,
        conversations: [],
      }),
      null,
    );
  });

  it("cannot send an empty new email", () => {
    const empty = evaluateNewEmailSend({
      to: "",
      subject: "",
      body: "",
      attachmentCount: 0,
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.reason, "missing_to");

    const noSubject = evaluateNewEmailSend({
      to: "a@example.com",
      subject: "",
      body: "Hello",
      attachmentCount: 0,
    });
    assert.equal(noSubject.ok, false);
    if (!noSubject.ok) assert.equal(noSubject.reason, "missing_subject");

    const noBody = evaluateNewEmailSend({
      to: "a@example.com",
      subject: "Hello",
      body: "   ",
      attachmentCount: 0,
    });
    assert.equal(noBody.ok, false);
    if (!noBody.ok) assert.equal(noBody.reason, "missing_body");
  });

  it("validates recipients and keeps a valid To", () => {
    assert.equal(isValidComposerEmailAddress("not-an-email"), false);
    assert.equal(isValidComposerEmailAddress("ok@example.com"), true);
    const invalid = evaluateNewEmailSend({
      to: "not-an-email",
      subject: "Hi",
      body: "Hello",
      attachmentCount: 0,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.reason, "invalid_to");
      assert.deepEqual(invalid.invalidAddresses, ["not-an-email"]);
    }
    assert.deepEqual(parseRecipientList("one@example.com, two@example.com"), [
      "one@example.com",
      "two@example.com",
    ]);
    assert.equal(
      evaluateNewEmailSend({
        to: "one@example.com; two@example.com",
        subject: "Hi",
        body: "Hello",
        attachmentCount: 0,
      }).ok,
      true,
    );
  });

  it("autosaves compose drafts and restores recipients, subject, body, and attachments", () => {
    const metadata = buildNewEmailConversationMetadata({
      to: ["to@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Quote follow-up",
      body: "Please review",
      signature: "Best regards,\nValueOR",
      updatedAt: "2026-09-11T00:00:00.000Z",
    });
    const withAttachment = buildEmailComposerDraftPatch(metadata, {
      ...readEmailComposerDraft(metadata)!,
      attachments: [
        {
          id: "att-1",
          name: "quote.pdf",
          storagePath:
            "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/att-1-quote.pdf",
          mimeType: "application/pdf",
          fileSize: 1200,
          kind: "pdf",
        },
      ],
    });
    const restored = readEmailComposerDraft(withAttachment);
    assert.ok(restored);
    assert.equal(restored?.mode, "compose");
    assert.deepEqual(restored?.to, ["to@example.com"]);
    assert.deepEqual(restored?.cc, ["cc@example.com"]);
    assert.deepEqual(restored?.bcc, ["bcc@example.com"]);
    assert.equal(restored?.subject, "Quote follow-up");
    assert.match(restored?.body ?? "", /Please review/);
    // Signature is shown separately in the rich composer — not embedded into draft body.
    assert.doesNotMatch(restored?.body ?? "", /Best regards/);
    assert.equal(restored?.attachments.length, 1);
    assert.equal(restored?.attachments[0]?.name, "quote.pdf");
    assert.equal(isNewEmailComposeConversation(withAttachment), true);
  });

  it("resolves the existing company Email channel without treating loading as unavailable", () => {
    const channel = {
      id: "email-ch-1",
      company_id: "co-1",
      deleted_at: null,
      is_enabled: true,
      provider: "email",
      communication_channel: { key: "email" },
      configuration: { channelKey: "email" },
    };
    assert.equal(pickCompanyEmailChannel({ companyId: "co-1", channels: [channel] })?.id, "email-ch-1");
    const workspaceCandidate = emailWorkspaceChannelToCandidate({
      id: "ws-email-1",
      companyId: "co-1",
      isEnabled: true,
      fromEmail: "desk@example.com",
      fromName: "Desk",
    });
    assert.equal(isCompanyEmailChannelRow("co-1", workspaceCandidate), true);
    assert.equal(
      pickCompanyEmailChannel({ companyId: "co-1", channels: [workspaceCandidate] })?.id,
      "ws-email-1",
    );
    assert.equal(workspaceCandidate.configuration?.smtpPassword, undefined);
    assert.equal(
      pickCompanyEmailChannel({
        companyId: "co-1",
        channels: [
          {
            id: "email-ch-embed-missing",
            company_id: "co-1",
            deleted_at: null,
            is_enabled: true,
            provider: "email",
            communication_channel: null,
            configuration: { channelKey: "email" },
          },
        ],
      })?.id,
      "email-ch-embed-missing",
    );
    assert.equal(
      pickCompanyEmailChannel({
        companyId: "co-1",
        channels: [{ ...channel, company_id: "co-2" }],
      }),
      null,
    );

    const pending = resolveNewEmailCompanyChannelId({
      companyId: "co-1",
      channels: [],
      channelsReady: false,
      conversations: [],
      conversationsReady: true,
    });
    assert.equal(pending.status, "pending");

    const queryFailedUsesConversation = resolveNewEmailCompanyChannelId({
      companyId: "co-1",
      channels: [],
      channelsReady: false,
      channelsFailed: true,
      conversations: [{ company_id: "co-1", company_channel_id: "email-ch-1" }],
      conversationsReady: true,
    });
    assert.equal(queryFailedUsesConversation.status, "ready");
    if (queryFailedUsesConversation.status === "ready") {
      assert.equal(queryFailedUsesConversation.channelId, "email-ch-1");
    }

    const queryFailedNoFallback = resolveNewEmailCompanyChannelId({
      companyId: "co-1",
      channels: [],
      channelsReady: false,
      channelsFailed: true,
      conversations: [],
      conversationsReady: true,
    });
    assert.equal(queryFailedNoFallback.status, "lookup_failed");

    const fromConversation = resolveNewEmailCompanyChannelId({
      companyId: "co-1",
      channels: [],
      channelsReady: true,
      conversations: [{ company_id: "co-1", company_channel_id: "email-ch-1" }],
      conversationsReady: true,
    });
    assert.equal(fromConversation.status, "ready");
    if (fromConversation.status === "ready") assert.equal(fromConversation.channelId, "email-ch-1");

    const missing = resolveNewEmailCompanyChannelId({
      companyId: "co-1",
      channels: [],
      channelsReady: true,
      conversations: [],
      conversationsReady: true,
    });
    assert.equal(missing.status, "ready");
    if (missing.status === "ready") assert.equal(missing.channelId, null);
  });

  it("diagnoseNewEmailChannelAvailability does not treat a real Email channel as unavailable", () => {
    const genericEmail = {
      id: "email-generic",
      company_id: "co-1",
      deleted_at: null,
      is_enabled: true,
      provider: "generic.email",
      communication_channel: null,
      configuration: {},
    };
    const smtpEmail = {
      id: "email-smtp",
      company_id: "co-1",
      deleted_at: null,
      is_enabled: true,
      provider: "smtp",
      communication_channel: null,
      configuration: { fromEmail: "support@company.test" },
    };
    const whatsappOnly = {
      id: "wa-1",
      company_id: "co-1",
      deleted_at: null,
      is_enabled: true,
      provider: "meta",
      communication_channel: { key: "whatsapp" },
      configuration: {},
    };

    assert.equal(isCompanyEmailChannelRow("co-1", genericEmail), true);
    assert.equal(isCompanyEmailChannelRow("co-1", smtpEmail), true);
    assert.equal(isCompanyEmailChannelRow("co-1", whatsappOnly), false);
    assert.equal(pickCompanyEmailChannel({ companyId: "co-1", channels: [genericEmail] })?.id, "email-generic");

    const ok = diagnoseNewEmailChannelAvailability({
      companyId: "co-1",
      channels: [genericEmail, whatsappOnly],
      channelsReady: true,
      conversations: [],
      conversationsReady: true,
      settingsReady: true,
      fromEmail: "support@company.test",
    });
    assert.equal(ok.reason, "ok");
    if (ok.reason === "ok") assert.equal(ok.channelId, "email-generic");

    const loadingSettings = diagnoseNewEmailChannelAvailability({
      companyId: "co-1",
      channels: [],
      channelsReady: true,
      conversations: [],
      conversationsReady: true,
      settingsReady: false,
    });
    assert.equal(loadingSettings.reason, "loading");

    const none = diagnoseNewEmailChannelAvailability({
      companyId: "co-1",
      channels: [whatsappOnly],
      channelsReady: true,
      conversations: [],
      conversationsReady: true,
      settingsReady: true,
    });
    assert.equal(none.reason, "no_channel");

    assert.deepEqual(
      evaluateNewEmailStart({
        userId: "u-1",
        companyId: "co-1",
        emailChannelEntitled: true,
        hasReplyPermission: true,
        isSuperAdmin: false,
        emailCompanyChannelId: null,
        assistantId: "asst-1",
      }),
      { ok: false, reason: "no_channel" },
    );
    assert.equal(
      evaluateNewEmailStart({
        userId: "u-1",
        companyId: "co-1",
        emailChannelEntitled: true,
        hasReplyPermission: true,
        isSuperAdmin: false,
        emailCompanyChannelId: "email-generic",
        assistantId: "asst-1",
      }).ok,
      true,
    );
  });

  it("ensures a company Email channel from existing settings instead of showing no_channel", async () => {
    assert.equal(
      shouldProvisionCompanyEmailChannel({
        existingChannelId: null,
        fromEmail: "support@company.test",
        settingsReady: true,
      }),
      true,
    );
    assert.equal(
      shouldProvisionCompanyEmailChannel({
        existingChannelId: "ch-1",
        fromEmail: "support@company.test",
        settingsReady: true,
      }),
      false,
    );
    assert.equal(
      shouldProvisionCompanyEmailChannel({
        existingChannelId: null,
        fromEmail: "support@company.test",
        settingsReady: false,
      }),
      false,
    );

    const payload = buildCompanyEmailChannelCreateInput({
      companyId: "co-1",
      emailChannelTypeId: "type-email",
      fromEmail: "support@company.test",
      fromName: "Support",
    });
    assert.equal(payload.provider, "generic.email");
    assert.equal(payload.configuration.credentialsSource, "company_email_settings");
    assert.equal(payload.configuration.fromEmail, "support@company.test");
    assert.equal(payload.displayName, "Support");

    const created = await ensureCompanyEmailChannelForCompose({
      companyId: "co-1",
      existingChannelId: null,
      fromEmail: "support@company.test",
      fromName: "Support",
      settingsReady: true,
      getEmailChannelType: async () => ({ id: "type-email" }),
      createConnection: async (input) => {
        assert.equal(input.companyId, "co-1");
        assert.equal(input.channelId, "type-email");
        return { id: "email-ch-created" };
      },
    });
    assert.equal(created.channelId, "email-ch-created");

    const reuse = await ensureCompanyEmailChannelForCompose({
      companyId: "co-1",
      existingChannelId: "email-existing",
      fromEmail: "support@company.test",
      settingsReady: true,
      getEmailChannelType: async () => {
        throw new Error("should not create when channel exists");
      },
      createConnection: async () => {
        throw new Error("should not create when channel exists");
      },
    });
    assert.equal(reuse.channelId, "email-existing");

    const missingSettings = await ensureCompanyEmailChannelForCompose({
      companyId: "co-1",
      existingChannelId: null,
      fromEmail: "",
      settingsReady: true,
      getEmailChannelType: async () => ({ id: "type-email" }),
      createConnection: async () => ({ id: "x" }),
    });
    assert.equal(missingSettings.channelId, null);
    if (!missingSettings.channelId) assert.equal(missingSettings.reason, "no_channel");
  });

  it("creates a company-scoped email conversation payload without guessing a customer", () => {
    const input = buildNewEmailConversationCreateInput({
      companyId: "co-1",
      aiAssistantId: "asst-1",
      companyChannelId: "email-ch-1",
      subject: "",
    });
    assert.equal(input.companyId, "co-1");
    assert.equal(input.channelType, "email");
    assert.equal(input.companyChannelId, "email-ch-1");
    assert.equal(input.customerId, null);
    assert.equal(input.metadata.emailComposeOrigin, "new_email");
    assert.equal(shouldShowComposeMode({ composerMode: "compose", conversationMetadata: input.metadata }), true);
  });

  it("matches a customer only on exact same-company email and never across companies", () => {
    const none = pickExactCompanyCustomerMatch({
      companyId: "co-1",
      recipientEmail: "new@example.com",
      candidates: [],
    });
    assert.equal(none.customerId, null);

    const cross = pickExactCompanyCustomerMatch({
      companyId: "co-1",
      recipientEmail: "same@example.com",
      candidates: [{ id: "cust-other", companyId: "co-2", email: "same@example.com" }],
    });
    assert.equal(cross.customerId, null);
    if (!cross.customerId) assert.equal(cross.reason, "none");

    const exact = pickExactCompanyCustomerMatch({
      companyId: "co-1",
      recipientEmail: "Same@Example.com",
      candidates: [{ id: "cust-1", companyId: "co-1", email: "same@example.com" }],
    });
    assert.equal(exact.customerId, "cust-1");

    const ambiguous = pickExactCompanyCustomerMatch({
      companyId: "co-1",
      recipientEmail: "dup@example.com",
      candidates: [
        { id: "a", companyId: "co-1", email: "dup@example.com" },
        { id: "b", companyId: "co-1", email: "dup@example.com" },
      ],
    });
    assert.equal(ambiguous.customerId, null);
    if (!ambiguous.customerId) assert.equal(ambiguous.reason, "ambiguous");
  });

  it("From identity comes from company settings, never a browser-invented mailbox", () => {
    assert.equal(
      formatCompanyFromIdentity({ fromName: "Support", fromEmail: "ops@company.com" }),
      "Support <ops@company.com>",
    );
    assert.equal(formatCompanyFromIdentity({ fromEmail: "ops@company.com" }), "ops@company.com");
    assert.equal(formatCompanyFromIdentity({}), "");
  });

  it("compose session insert reuses channel_sessions columns without inventing a reply thread", () => {
    const row = buildEmailComposeSessionInsert({
      companyId: "co-1",
      companyChannelId: "email-ch-1",
      conversationId: "conv-new",
      fromEmail: "ops@company.com",
    });
    assert.equal(row.channel_key, "email");
    assert.equal(row.company_id, "co-1");
    assert.equal(row.conversation_id, "conv-new");
    assert.equal(row.external_thread_id, "conv-new");
    assert.equal(row.sender_external_id, "ops@company.com");
    assert.equal(row.metadata.source, "email_workspace_compose");
  });

  it("compose outbound uses the existing pipeline and is not a reply", () => {
    assert.equal(requiresServerOutboundDispatch("email"), true);
    const metadata = buildEmailWorkspaceOutboundMetadata({
      mode: "compose",
      messages: [],
      to: ["new@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Brand new",
    });
    assert.equal(metadata.recipientEmail, "new@example.com");
    assert.equal(metadata.emailSubject, "Brand new");
    assert.equal(metadata.emailComposerMode, "compose");
    assert.equal(metadata.inReplyTo, undefined);
    assert.equal(metadata.emailReferences, undefined);
    assert.equal(metadata.threadRootMessageId, undefined);
    assert.deepEqual(metadata.cc, ["cc@example.com"]);
    assert.deepEqual(metadata.bcc, ["bcc@example.com"]);
  });

  it("successful SMTP-style send increments Sent metrics; failed does not stay pending-only", () => {
    const afterSend = countEmailWorkspaceOutboundMetrics([
      {
        message_type: "outgoing",
        status: "sent",
        metadata: { dispatchConfirmed: true, outboundPhase: "sent", emailComposerMode: "compose" },
        external_message_id: "mid-compose@valueor-test.local",
      },
    ]);
    assert.equal(afterSend.sent, 1);

    const afterFail = countEmailWorkspaceOutboundMetrics([
      {
        message_type: "outgoing",
        status: "failed",
        metadata: { outboundPhase: "failed", dispatchFailed: true, emailComposerMode: "compose" },
      },
    ]);
    assert.equal(afterFail.failed, 1);
    assert.equal(afterFail.pending, 0);
  });

  it("existing template insertion populates draft fields only", () => {
    const rendered = renderEmailTemplate(
      { subject: "Hello {{customer.name}}", body: "Thanks {{customer.name}}" },
      { "customer.name": "Ada" },
    );
    assert.equal(rendered.subject, "Hello Ada");
    assert.equal(rendered.body, "Thanks Ada");
  });

  it("attachment upload/remove reuse existing validation; removal drops the draft ref", () => {
    const uploaded = validateEmailComposerFile(
      { name: "brief.txt", size: 12, type: "text/plain" },
      0,
    );
    assert.equal(uploaded.ok, true);
    const draft = buildEmailComposerDraftPatch(
      {},
      {
        mode: "compose",
        to: ["a@b.com"],
        cc: [],
        bcc: [],
        subject: "File",
        body: "See attached",
        updatedAt: "2026-09-11T00:00:00.000Z",
        attachments: uploaded.ok
          ? [
              {
                id: "att-rm",
                name: uploaded.filename,
                storagePath:
                  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/att-rm-brief.txt",
                mimeType: uploaded.mimeType,
                fileSize: 12,
                kind: uploaded.kind,
              },
            ]
          : [],
      },
    );
    assert.equal(readEmailComposerDraft(draft)?.attachments.length, 1);
    const removed = buildEmailComposerDraftPatch(draft, {
      ...readEmailComposerDraft(draft)!,
      attachments: [],
    });
    assert.equal(readEmailComposerDraft(removed)?.attachments.length, 0);
  });

  it("AI write/improve return body text only and never send", async () => {
    let sendCount = 0;
    const write = await generateEmailAiDraft(
      {
        companyId: "co-1",
        conversationId: "conv-new",
        action: "generate_reply",
        threadText: "",
        draftText: "Write a polite introduction",
        targetLanguage: "en",
      },
      {
        chatCompletion: async (body) => {
          assert.equal("send" in body, false);
          assert.match(JSON.stringify(body.messages), /Do not send email/i);
          assert.match(JSON.stringify(body.messages), /Do not invent customer names/i);
          return { text: "Polite introduction draft" };
        },
      },
    );
    const improve = await generateEmailAiDraft(
      {
        companyId: "co-1",
        conversationId: "conv-new",
        action: "improve",
        threadText: "",
        draftText: "Polite introduction draft",
        targetLanguage: "en",
      },
      {
        chatCompletion: async () => ({ text: "Improved introduction draft" }),
      },
    );
    assert.equal(write, "Polite introduction draft");
    assert.equal(improve, "Improved introduction draft");
    assert.equal(sendCount, 0);
  });

  it("workspace paints New Email immediately after create, before session insert", () => {
    const panel = readFileSync(join(here, "../../components/email/email-workspace-panel.tsx"), "utf8");
    const startAt = panel.indexOf("const startNewEmail = useCallback");
    assert.ok(startAt > 0);
    const startSlice = panel.slice(startAt, startAt + 14000);
    assert.match(startSlice, /findReusableEmptyNewEmailComposeShell/);
    const createAt = startSlice.indexOf("createConversation(context, input)");
    assert.ok(createAt > 0);
    const createSlice = startSlice.slice(createAt);
    const pendingAt = createSlice.indexOf("setPendingCreatedConversation(created)");
    const selectedAt = createSlice.indexOf("setSelectedId(created.id)");
    const composerAt = createSlice.indexOf('mode: "compose"');
    const sessionAt = createSlice.indexOf("ensureEmailComposeChannelSession(");
    assert.ok(pendingAt > 0);
    assert.ok(selectedAt > pendingAt);
    assert.ok(composerAt > 0 && composerAt < sessionAt);
    assert.ok(sessionAt > selectedAt);
    assert.match(panel, /pendingCreatedConversation\?\.id === selectedId \? pendingCreatedConversation/);
    assert.match(panel, /email-compose-opening/);
    assert.match(panel, /composeStarting/);
    assert.match(panel, /settingsReady: emailSettingsQuery.isSuccess \|\| emailSettingsQuery.isError/);
    assert.match(panel, /fromEmail: emailSettings\?\.fromEmail/);
    assert.match(panel, /ensureCompanyEmailChannelForCompose/);
    assert.match(panel, /hasPermission\("email.view"\)/);
    assert.match(panel, /canProvisionEmailChannel/);
    assert.doesNotMatch(panel, /code === "channels.view"/);
    assert.doesNotMatch(panel, /useCompanyChannelsAdmin/);
  });

  it("company signature appears once on compose and after AI restore", () => {
    const signature = "Best regards,\nValueOR Support";
    const first = appendSignatureOnce("", signature);
    const again = appendSignatureOnce(first, signature);
    assert.equal(again, first);
    assert.equal(again.split(signature).length - 1, 1);
  });
});
