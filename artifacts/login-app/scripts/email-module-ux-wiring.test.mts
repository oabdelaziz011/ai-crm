import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(dir, rel), "utf8");

const inbox = read("../src/pages/dashboard/email/email-inbox-page.tsx");
const workspace = read("../src/components/email/email-workspace-panel.tsx");
const setup = read("../src/components/email/email-setup-status-card.tsx");
const subNav = read("../src/components/email/layout/email-sub-nav.tsx");
const copilot = read("../src/components/email/email-ai-copilot-menu.tsx");
const templates = read("../src/pages/dashboard/email/email-templates-page.tsx");
const routing = read("../src/pages/dashboard/email/email-ai-routing-page.tsx");
const assist = read("../src/lib/email-workspace/email-ai-assist.ts");
const en = read("../src/locales/en/common.json");
const ar = read("../src/locales/ar/common.json");

describe("email module UX wiring (enterprise workspace)", () => {
  it("landing is workspace-first with collapsible delivery", () => {
    assert.match(inbox, /EmailSetupStatusCard/);
    assert.match(inbox, /EmailInboxMetrics/);
    assert.match(inbox, /EmailWorkspacePanel/);
    assert.match(inbox, /EmailFirstTimeOnboarding/);
    assert.match(inbox, /deliveryOpen/);
    assert.match(inbox, /EmailCommunicationPanel/);
  });

  it("setup card uses live settings and never hardcodes success", () => {
    assert.match(setup, /useEmailControlCenter/);
    assert.match(setup, /emailModule\.controlCenter/);
    assert.match(setup, /emailModule\.howItWorks/);
    assert.doesNotMatch(setup, /always.?ready|fabricat/i);
    assert.match(setup, /~\/dashboard\/settings\/email/);
    assert.match(subNav, /~\/dashboard\/settings\/email/);
  });

  it("AI Copilot inserts draft text and never sends", () => {
    assert.match(copilot, /EmailAiCopilotMenu/);
    assert.match(copilot, /onAction/);
    assert.match(assist, /Do not send email/);
    assert.match(assist, /Return ONLY the email body text/);
    assert.doesNotMatch(assist, /dispatchOutbound|sendMail|smtp/i);
    assert.match(workspace, /EmailAiCopilotMenu/);
    assert.match(workspace, /setComposer/);
    assert.match(workspace, /generateEmailAiDraft/);
    assert.match(workspace, /neverSendHint/);
    assert.doesNotMatch(workspace, /dispatchOutboundMessage/);
  });

  it("ticket context hides SLA unless ticket is open", () => {
    assert.match(workspace, /OPEN_TICKET_STATUSES/);
    assert.match(workspace, /slaDueAt && OPEN_TICKET_STATUSES/);
    assert.match(workspace, /openTicket360/);
    assert.match(workspace, /openCustomer360/);
    assert.match(workspace, /~\/dashboard\/tickets/);
    assert.match(workspace, /~\/dashboard\/customers/);
  });

  it("templates support category UI + AI improve into draft only", () => {
    assert.match(templates, /EMAIL_TEMPLATE_CATEGORY_DEFS/);
    assert.match(templates, /classifyEmailTemplateCategory/);
    assert.match(templates, /improveBodyWithAi/);
    assert.match(templates, /generateEmailAiDraft/);
    assert.match(templates, /recommendedTemplatesForCategory/);
    assert.match(templates, /startFromRecommended/);
    assert.doesNotMatch(templates, /dispatchOutbound|sendMail\(/);
  });

  it("routing UI explains flow without rebuilding the engine", () => {
    assert.match(routing, /emailModule\.aiRouting\.flowTitle/);
    assert.match(routing, /useEmailRoutingConfig/);
    assert.match(routing, /useUpsertEmailRoutingConfig/);
  });

  it("EN/AR copy covers setup, metrics, copilot, and categories", () => {
    for (const locale of [en, ar]) {
      assert.match(locale, /"setup"/);
      assert.match(locale, /"metrics"/);
      assert.match(locale, /"copilot"/);
      assert.match(locale, /"draft_from_context"/);
      assert.match(locale, /"customerService"/);
      assert.match(locale, /"ticketStatus"/);
      assert.match(locale, /"flowTitle"/);
    }
    assert.match(en, /Your company email workspace/);
    assert.match(ar, /مركز البريد الإلكتروني لشركتك/);
    assert.match(en, /Email Control Center/);
    assert.match(ar, /مركز التحكم بالبريد الإلكتروني/);
    assert.match(en, /How does Email work/);
    assert.match(ar, /كيف يعمل البريد الإلكتروني/);
  });
});
