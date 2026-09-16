/**
 * Marketing Campaigns Phase 2C — UI presentation + contract tests.
 * No React mount, no DB, no real WhatsApp / Instagram / Messenger sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CAMPAIGN_UI_CHANNELS,
  campaignStatusLabelKey,
  channelLabelKey,
  isCampaignUiChannel,
  overallCampaignResultKind,
  recipientStatusLabelKey,
  skipReasonLabelKey,
} from "./campaign-ui-presentation.ts";
import { MARKETING_CAMPAIGN_CHANNELS } from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const loginAppSrc = join(__dirname, "../..");

const en = JSON.parse(
  readFileSync(join(loginAppSrc, "locales/en/common.json"), "utf8"),
) as Record<string, unknown>;
const ar = JSON.parse(
  readFileSync(join(loginAppSrc, "locales/ar/common.json"), "utf8"),
) as Record<string, unknown>;

function dig(root: Record<string, unknown>, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function assertLocaleString(path: string, expectedEn: string, expectedAr: string) {
  assert.equal(dig(en, path), expectedEn, `EN missing/wrong: ${path}`);
  assert.equal(dig(ar, path), expectedAr, `AR missing/wrong: ${path}`);
}

const wizardSrc = readFileSync(
  join(loginAppSrc, "pages/dashboard/campaigns/campaign-create-wizard-page.tsx"),
  "utf8",
);
const listSrc = readFileSync(
  join(loginAppSrc, "pages/dashboard/campaigns/campaign-list-page.tsx"),
  "utf8",
);
const detailSrc = readFileSync(
  join(loginAppSrc, "pages/dashboard/campaigns/campaign-detail-page.tsx"),
  "utf8",
);
const layoutSrc = readFileSync(
  join(loginAppSrc, "pages/dashboard/campaigns/campaigns-layout.tsx"),
  "utf8",
);
const registrySrc = readFileSync(
  join(loginAppSrc, "config/campaigns-route-registry.ts"),
  "utf8",
);
const dashboardRegistrySrc = readFileSync(
  join(loginAppSrc, "config/dashboard-route-registry.ts"),
  "utf8",
);
const hooksSrc = readFileSync(join(loginAppSrc, "hooks/campaigns/use-campaigns.ts"), "utf8");

describe("campaigns UI channels", () => {
  it("exposes WhatsApp, Instagram, Messenger, Email, and SMS", () => {
    assert.deepEqual([...CAMPAIGN_UI_CHANNELS], [
      "whatsapp",
      "instagram",
      "messenger",
      "email",
      "sms",
    ]);
    assert.equal(isCampaignUiChannel("sms"), true);
    assert.equal(isCampaignUiChannel("whatsapp"), true);
    assert.equal(isCampaignUiChannel("email"), true);
  });

  it("lists SMS as a first-class campaign channel", () => {
    assert.ok((MARKETING_CAMPAIGN_CHANNELS as readonly string[]).includes("sms"));
    assert.ok(CAMPAIGN_UI_CHANNELS.includes("sms"));
    assert.ok(wizardSrc.includes("smsProviderHint"));
    assert.ok(wizardSrc.includes("willSend"));
    assert.ok(wizardSrc.includes("selectedSendTotal"));
    assert.ok(!wizardSrc.includes("campaign-channel-sms-absent"));
    assert.ok(!listSrc.includes("campaigns-sms-absent"));
  });
});

describe("campaigns presentation labels", () => {
  it("maps campaign statuses to locale keys", () => {
    assert.equal(campaignStatusLabelKey("draft"), "campaigns.status.draft");
    assert.equal(campaignStatusLabelKey("running"), "campaigns.status.running");
    assert.equal(campaignStatusLabelKey("completed"), "campaigns.status.completed");
    assert.equal(campaignStatusLabelKey("failed"), "campaigns.status.failed");
    assert.equal(campaignStatusLabelKey("cancelled"), "campaigns.status.cancelled");
  });

  it("maps recipient statuses including queued vs sent", () => {
    assert.equal(recipientStatusLabelKey("queued"), "campaigns.recipientStatus.queued");
    assert.equal(recipientStatusLabelKey("sent"), "campaigns.recipientStatus.sent");
    assert.equal(recipientStatusLabelKey("skipped"), "campaigns.recipientStatus.skipped");
  });

  it("maps channels", () => {
    assert.equal(channelLabelKey("whatsapp"), "campaigns.channels.whatsapp");
    assert.equal(channelLabelKey("instagram"), "campaigns.channels.instagram");
    assert.equal(channelLabelKey("messenger"), "campaigns.channels.messenger");
    assert.equal(channelLabelKey("email"), "campaigns.channels.email");
    assert.equal(channelLabelKey("sms"), "campaigns.channels.sms");
  });

  it("maps skip reasons to safe keys (no raw secrets)", () => {
    assert.equal(skipReasonLabelKey("No eligible WhatsApp phone"), "campaigns.skipReasons.noPhone");
    assert.equal(skipReasonLabelKey("Customer has no eligible email destination"), "campaigns.skipReasons.noEmail");
    assert.equal(skipReasonLabelKey("Customer has no eligible SMS destination"), "campaigns.skipReasons.noSms");
    assert.equal(
      skipReasonLabelKey("receive_marketing false"),
      "campaigns.skipReasons.marketingOptOut",
    );
    assert.equal(
      skipReasonLabelKey("no_instagram_conversation"),
      "campaigns.skipReasons.noInstagramConversation",
    );
    assert.equal(
      skipReasonLabelKey("no_messenger_conversation"),
      "campaigns.skipReasons.noMessengerConversation",
    );
    assert.equal(skipReasonLabelKey("messaging_window_expired"), "campaigns.skipReasons.messagingWindow");
    assert.equal(skipReasonLabelKey("channel unavailable"), "campaigns.skipReasons.channelUnavailable");
    assert.equal(skipReasonLabelKey("token=SECRET"), "campaigns.skipReasons.generic");
  });

  it("treats mixed outcomes as partial success, not blanket failed", () => {
    assert.equal(
      overallCampaignResultKind({
        status: "completed",
        queued: 800,
        sent: 300,
        failed: 100,
        skipped: 50,
      }),
      "partial",
    );
    assert.equal(
      overallCampaignResultKind({
        status: "completed",
        queued: 10,
        sent: 0,
        failed: 0,
        skipped: 0,
      }),
      "completed",
    );
    assert.equal(
      overallCampaignResultKind({
        status: "failed",
        queued: 0,
        sent: 0,
        failed: 5,
        skipped: 0,
      }),
      "failed",
    );
  });
});

describe("campaigns EN/AR localization", () => {
  it("has navigation + core status labels", () => {
    assertLocaleString("navigation.campaigns", "Campaigns", "الحملات");
    assertLocaleString("campaigns.status.draft", "Draft", "مسودة");
    assertLocaleString("campaigns.status.running", "Running", "قيد التنفيذ");
    assertLocaleString("campaigns.status.completed", "Completed", "مكتملة");
    assertLocaleString("campaigns.status.failed", "Failed", "فشل");
    assertLocaleString("campaigns.recipientStatus.queued", "Queued", "في الانتظار");
    assertLocaleString("campaigns.recipientStatus.sent", "Sent", "تم الإرسال");
    assertLocaleString("campaigns.recipientStatus.skipped", "Skipped", "تم التخطي");
  });

  it("has skip reason Arabic copy", () => {
    assertLocaleString("campaigns.channels.email", "Email", "البريد الإلكتروني");
    assertLocaleString("campaigns.channels.sms", "SMS", "اس ام اس");
    assertLocaleString("campaigns.skipReasons.noPhone", "No phone number", "لا يوجد رقم هاتف");
    assertLocaleString("campaigns.skipReasons.noEmail", "No email address", "لا يوجد بريد إلكتروني");
    assertLocaleString("campaigns.skipReasons.noSms", "No SMS number", "لا يوجد رقم لإرسال رسالة نصية");
    assertLocaleString(
      "campaigns.skipReasons.marketingOptOut",
      "Customer opted out of marketing messages",
      "العميل غير مشترك في الرسائل التسويقية",
    );
    assertLocaleString(
      "campaigns.skipReasons.noInstagramConversation",
      "No eligible Instagram conversation",
      "لا توجد محادثة Instagram مؤهلة",
    );
    assertLocaleString(
      "campaigns.skipReasons.noMessengerConversation",
      "No eligible Messenger conversation",
      "لا توجد محادثة Messenger مؤهلة",
    );
    assertLocaleString(
      "campaigns.skipReasons.messagingWindow",
      "Messaging window expired",
      "انتهت نافذة المراسلة",
    );
    assertLocaleString(
      "campaigns.skipReasons.channelUnavailable",
      "Channel unavailable",
      "القناة غير متاحة",
    );
  });

  it("has wizard confirm & send labels", () => {
    assertLocaleString("campaigns.wizard.confirmSend", "Confirm & Send", "تأكيد وإرسال");
    assertLocaleString(
      "campaigns.wizard.errors.confirmRequired",
      "Confirm before sending.",
      "أكد قبل الإرسال.",
    );
  });
});

describe("campaigns routes + permissions wiring", () => {
  it("registers dashboard section with campaigns commercial + RBAC", () => {
    assert.ok(dashboardRegistrySrc.includes('id: "campaigns"'));
    assert.ok(dashboardRegistrySrc.includes('path: "/dashboard/campaigns"'));
    assert.ok(dashboardRegistrySrc.includes('permission: "campaigns.view"'));
    assert.ok(dashboardRegistrySrc.includes('commercialFeatureCode: "campaigns"'));
  });

  it("registers list / create / detail nested routes with campaigns commercial", () => {
    assert.ok(registrySrc.includes('nestedPath: "/"'));
    assert.ok(registrySrc.includes('nestedPath: "/new"'));
    assert.ok(registrySrc.includes('nestedPath: "/:campaignId"'));
    assert.ok(registrySrc.includes('permission: "campaigns.create"'));
    assert.ok(registrySrc.includes('commercialFeatureCode: "campaigns"'));
  });

  it("layout gates on campaigns.view + campaigns entitlement; wizard gates create/send", () => {
    assert.ok(layoutSrc.includes("campaigns.view"));
    assert.ok(layoutSrc.includes('commercialFeatureEnabled("campaigns")'));
    assert.ok(wizardSrc.includes("campaigns.create"));
    assert.ok(wizardSrc.includes("campaigns.send"));
    assert.ok(listSrc.includes("campaigns.create"));
  });
});

describe("campaigns wizard execution safety (source contract)", () => {
  it("only executes via Confirm & Send path after explicit confirmation", () => {
    assert.ok(wizardSrc.includes("campaign-confirm-send"));
    assert.ok(wizardSrc.includes("campaign-confirm-checkbox"));
    assert.ok(wizardSrc.includes("confirmRequired"));
    assert.ok(wizardSrc.includes("if (!confirmed)"));
    assert.ok(wizardSrc.includes("mutateAsync"));
    assert.ok(wizardSrc.includes("getOrCreateCampaignSubmissionIdempotencyKey"));
    assert.ok(wizardSrc.includes("submissionIdempotencyKey"));
    assert.ok(!wizardSrc.includes("idempotencyKey: crypto.randomUUID()"));
    // Pending attachment ids may use randomUUID; the campaign submit key must not.
    // Preview/eligibility must not call execute/createDraft
    assert.ok(!wizardSrc.includes("service.execute"));
    assert.ok(hooksSrc.includes("previewChannelEligibility"));
    assert.ok(hooksSrc.includes("createDraft"));
    assert.ok(hooksSrc.includes("service.execute"));
    assert.ok(hooksSrc.includes("idempotencyKey: input.idempotencyKey"));
    // createDraft+execute only inside useCreateAndExecuteCampaign mutation
    const previewBlock = hooksSrc.slice(
      hooksSrc.indexOf("useCampaignEligibilityPreview"),
      hooksSrc.indexOf("useCreateAndExecuteCampaign"),
    );
    assert.ok(!previewBlock.includes("createDraft"));
    assert.ok(!previewBlock.includes("service.execute"));
  });

  it("supports multi-channel selection UI hooks", () => {
    assert.ok(wizardSrc.includes("campaign-channel-${channel}"));
    assert.ok(wizardSrc.includes("toggleChannel"));
    for (const channel of CAMPAIGN_UI_CHANNELS) {
      assert.ok(isCampaignUiChannel(channel));
    }
  });

  it("manual audience picker is a table with identity + channel availability columns", () => {
    const tableSrc = readFileSync(
      join(loginAppSrc, "components/campaigns/campaign-manual-audience-table.tsx"),
      "utf8",
    );
    assert.ok(wizardSrc.includes("CampaignManualAudienceTable"));
    assert.ok(wizardSrc.includes("toggleManualAll"));
    assert.ok(wizardSrc.includes("useCampaignCustomerChannelPresence"));
    assert.ok(tableSrc.includes("formatCampaignPickerPhone"));
    assert.ok(tableSrc.includes("campaign-manual-audience-grid"));
    assert.ok(tableSrc.includes("<bdi"));
    assert.ok(tableSrc.includes("IdentityValue"));
    assert.ok(tableSrc.includes("text-start"));
    assert.ok(!tableSrc.includes("max-w-0"));
    assert.ok(!tableSrc.includes("table-fixed"));
    assert.ok(tableSrc.includes("CAMPAIGN_PICKER_CHANNEL_COLUMNS"));
    assert.ok(tableSrc.includes("campaigns.wizard.audience.table.messenger"));
    assert.ok(tableSrc.includes("campaigns.wizard.audience.table.whatsapp"));
    assert.ok(tableSrc.includes("campaigns.wizard.audience.table.instagram"));
    assert.ok(tableSrc.includes("campaigns.wizard.audience.table.emailChannel"));
    assert.ok(tableSrc.includes("campaigns.wizard.audience.table.sms"));
    assertLocaleString("campaigns.wizard.audience.table.name", "Name", "الاسم");
    assertLocaleString("campaigns.wizard.audience.table.phone", "Mobile", "رقم الموبايل");
    assertLocaleString("campaigns.wizard.audience.table.email", "Email", "الإيميل");
    assertLocaleString("campaigns.wizard.audience.table.messenger", "Messenger", "مسنجر");
    assertLocaleString("campaigns.wizard.audience.table.whatsapp", "WhatsApp", "واتساب");
    assertLocaleString("campaigns.wizard.audience.table.instagram", "Instagram", "إنستجرام");
    assertLocaleString("campaigns.wizard.audience.table.emailChannel", "Email", "إيميل");
    assertLocaleString("campaigns.wizard.audience.table.sms", "SMS", "اس ام اس");
  });

  it("shows per-channel content previews", () => {
    assert.ok(wizardSrc.includes("whatsappPreviewHint"));
    assert.ok(wizardSrc.includes("smsPreviewHint"));
    assert.ok(wizardSrc.includes("emailMailboxHint"));
    assert.ok(wizardSrc.includes("smsProviderHint"));
    assert.ok(wizardSrc.includes("emailPreviewHint"));
    assert.ok(wizardSrc.includes("plainPreviewHint"));
    assert.ok(wizardSrc.includes("renderCampaignOutboundText"));
    assert.ok(wizardSrc.includes("campaign-whatsapp-preview"));
    assert.ok(wizardSrc.includes("campaign-email-preview"));
    assert.ok(wizardSrc.includes("CampaignContentAttachments"));
    assert.ok(wizardSrc.includes("uploadCampaignContentAttachments"));
    assert.ok(!wizardSrc.includes("marketing_campaign"));
    assert.ok(!String(dig(en, "campaigns.wizard.content.whatsappPreviewHint")).includes("marketing_campaign"));
    assert.ok(!String(dig(ar, "campaigns.wizard.content.whatsappPreviewHint")).includes("marketing_campaign"));
    assert.ok(!String(dig(en, "campaigns.wizard.content.smsPreviewHint")).includes("marketing_campaign"));
    assertLocaleString(
      "campaigns.wizard.content.whatsappPreviewHint",
      "WhatsApp sends this text to the customer.",
      "واتساب يرسل هذا النص للعميل.",
    );
    assertLocaleString("campaigns.wizard.content.attachments", "Attachments", "مرفقات");
    assertLocaleString("campaigns.wizard.content.addAttachments", "Add files", "إضافة ملفات");
    assertLocaleString("campaigns.detail.noAttachments", "No files attached.", "لا توجد ملفات مرفقة.");
  });

  it("lists and details distinguish queued vs sent", () => {
    assert.ok(listSrc.includes("queued_count"));
    assert.ok(listSrc.includes("sent_count"));
    assert.ok(detailSrc.includes("queuedVsSent"));
    assert.ok(detailSrc.includes("recipientStatusLabelKey"));
    assert.ok(detailSrc.includes("skipReasonLabelKey"));
  });
});
