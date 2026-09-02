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

describe("campaigns UI channels (SMS hidden)", () => {
  it("exposes only WhatsApp, Instagram, Messenger", () => {
    assert.deepEqual([...CAMPAIGN_UI_CHANNELS], ["whatsapp", "instagram", "messenger"]);
    assert.equal(isCampaignUiChannel("sms"), false);
    assert.equal(isCampaignUiChannel("whatsapp"), true);
  });

  it("does not list SMS even if domain ever widened", () => {
    assert.ok(!(MARKETING_CAMPAIGN_CHANNELS as readonly string[]).includes("sms"));
    assert.ok(!/campaign-channel-sms(?!-absent)/.test(wizardSrc));
    assert.ok(listSrc.includes("campaigns-sms-absent"));
    assert.ok(wizardSrc.includes("campaign-channel-sms-absent"));
    assert.ok(!CAMPAIGN_UI_CHANNELS.includes("sms" as never));
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
  });

  it("maps skip reasons to safe keys (no raw secrets)", () => {
    assert.equal(skipReasonLabelKey("No eligible WhatsApp phone"), "campaigns.skipReasons.noPhone");
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
    assertLocaleString("campaigns.skipReasons.noPhone", "No phone number", "لا يوجد رقم هاتف");
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
    assert.ok(!wizardSrc.includes("crypto.randomUUID()"));
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

  it("shows per-channel content previews", () => {
    assert.ok(wizardSrc.includes("whatsappPreviewHint"));
    assert.ok(wizardSrc.includes("plainPreviewHint"));
    assert.ok(wizardSrc.includes("renderMetaMessagingCampaignText"));
  });

  it("lists and details distinguish queued vs sent", () => {
    assert.ok(listSrc.includes("queued_count"));
    assert.ok(listSrc.includes("sent_count"));
    assert.ok(detailSrc.includes("queuedVsSent"));
    assert.ok(detailSrc.includes("recipientStatusLabelKey"));
    assert.ok(detailSrc.includes("skipReasonLabelKey"));
  });
});
