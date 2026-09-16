/**
 * Layout guard: Email Workspace list/messages/composer must scroll correctly.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const panelSrc = readFileSync(
  join(here, "../../components/email/email-workspace-panel.tsx"),
  "utf8",
);
const inboxPageSrc = readFileSync(
  join(here, "../../pages/dashboard/email/email-inbox-page.tsx"),
  "utf8",
);
const sentPageSrc = readFileSync(
  join(here, "../../pages/dashboard/email/email-sent-page.tsx"),
  "utf8",
);
const emailLayoutSrc = readFileSync(
  join(here, "../../components/email/layout/email-layout.tsx"),
  "utf8",
);
const outletSrc = readFileSync(
  join(here, "../../components/dashboard/dashboard-outlet.tsx"),
  "utf8",
);
const dashLayoutSrc = readFileSync(
  join(here, "../../components/dashboard/dashboard-layout.tsx"),
  "utf8",
);
const setupCardSrc = readFileSync(
  join(here, "../../components/email/email-setup-status-card.tsx"),
  "utf8",
);
const composerEditorSrc = readFileSync(
  join(here, "../../components/email/email-composer-body-editor.tsx"),
  "utf8",
);

describe("email workspace thread layout", () => {
  it("keeps email edge-to-edge in the dashboard shell so the inbox list can scroll", () => {
    assert.match(dashLayoutSrc, /isEmailModule/);
    assert.match(dashLayoutSrc, /isEdgeToEdgeWorkspace/);
    assert.match(outletSrc, /EMAIL_MODULE_PATH/);
    assert.match(outletSrc, /isEmailModule/);
  });

  it("uses a route-local viewport-height email shell for the inbox flex chain", () => {
    assert.match(emailLayoutSrc, /data-testid="email-module-shell"/);
    assert.match(emailLayoutSrc, /flex h-full min-h-0 flex-col/);
    assert.match(emailLayoutSrc, /pathOnly/);
    assert.match(emailLayoutSrc, /isNestedSectionActive\(pathOnly, "\/sent"\)/);
    assert.match(emailLayoutSrc, /flex h-full min-h-0 flex-1 flex-col overflow-hidden/);
    assert.match(inboxPageSrc, /data-testid="email-workspace-height-shell"/);
    assert.match(inboxPageSrc, /flex h-full min-h-0 flex-1 flex-col overflow-hidden/);
    assert.match(panelSrc, /flex h-full min-h-0 flex-col overflow-hidden/);
    assert.doesNotMatch(panelSrc, /xl:max-h-\[min\(70dvh,44rem\)\]/);
  });

  it("scrolls the conversation and reply form together with modes/send always reachable", () => {
    assert.match(panelSrc, /data-testid="email-workspace-messages-scroll"/);
    assert.match(panelSrc, /data-testid="email-workspace-composer"/);
    assert.doesNotMatch(panelSrc, /data-testid="email-workspace-thread-scroll"/);
    assert.doesNotMatch(panelSrc, /sticky bottom-0/);
    assert.match(
      panelSrc,
      /min-h-\[10rem\] flex-1 basis-0 space-y-3 overflow-y-auto px-4 py-4/,
    );
    assert.doesNotMatch(
      panelSrc,
      /flex max-h-\[min\(56%,38rem\)\] min-h-0 shrink-0 flex-col border-t border-border/,
    );
    assert.match(panelSrc, /data-testid="email-workspace-composer-scroll"/);
    assert.doesNotMatch(
      panelSrc,
      /data-testid="email-workspace-composer-scroll"[\s\S]{0,80}overflow-y-auto/,
    );
    assert.match(panelSrc, /data-email-message-direction/);
    assert.match(panelSrc, /justify-start/);
    assert.match(panelSrc, /justify-end/);
    assert.match(panelSrc, /EMAIL_HTML_DOCUMENT_CLASSNAME/);
    assert.doesNotMatch(panelSrc, /email-thread-message-html[\s\S]{0,200}prose prose-sm/);
    assert.match(composerEditorSrc, /min-h-\[11rem\]/);
    assert.doesNotMatch(composerEditorSrc, /max-h-\[22rem\] overflow-y-auto/);
    assert.doesNotMatch(composerEditorSrc, /max-h-16 overflow-hidden/);
  });

  it("scrolls only the conversation list and messages as workspace regions", () => {
    assert.match(panelSrc, /data-testid="email-workspace-conversation-list"/);
    assert.match(panelSrc, /minmax\(24rem,30rem\)/);
    assert.match(panelSrc, /minmax\(26rem,34rem\)/);
    assert.match(panelSrc, /className="min-h-0 flex-1 overflow-y-auto"/);
    assert.doesNotMatch(panelSrc, /overflow-y-scroll/);
    assert.match(panelSrc, /data-testid="email-workspace-context-panel"/);
    assert.match(panelSrc, /selectedId \? "hidden xl:block" : "hidden"/);
  });

  it("caps inbox top chrome so the workspace pane keeps a definite remaining height", () => {
    assert.match(inboxPageSrc, /EmailSetupStatusCard/);
    assert.match(inboxPageSrc, /EmailInboxMetrics/);
    assert.match(inboxPageSrc, /data-testid="email-inbox-top-chrome"/);
    assert.match(inboxPageSrc, /max-h-\[min\(28vh,16rem\)\]/);
    assert.match(inboxPageSrc, /data-testid="email-workspace-height-shell"/);
    assert.match(inboxPageSrc, /flex h-full min-h-0 flex-1 flex-col overflow-hidden/);
    assert.match(setupCardSrc, /data-testid="email-control-center"/);
    assert.match(setupCardSrc, /useState\(true\)/);
    assert.match(setupCardSrc, /collapsed \? "px-3 py-1.5"/);
    assert.match(setupCardSrc, /flex min-w-0 items-center gap-1.5/);
    assert.match(setupCardSrc, /snapshot\.cards\.map/);
  });

  it("keeps the Email page title and workspace heading visible", () => {
    assert.match(emailLayoutSrc, /data-testid="email-module-page-header"/);
    assert.match(emailLayoutSrc, /emailModule\.title/);
    assert.match(emailLayoutSrc, /emailModule\.subtitle/);
    assert.match(emailLayoutSrc, /ModulePageHeader/);
    assert.match(panelSrc, /data-testid="email-workspace-heading"/);
    assert.match(panelSrc, /emailModule\.workspace\.title/);
    assert.match(panelSrc, /emailModule\.workspace\.subtitle/);
  });

  it("does not render Delivery Activity on the Email Inbox page", () => {
    assert.doesNotMatch(inboxPageSrc, /EmailCommunicationPanel/);
    assert.doesNotMatch(inboxPageSrc, /deliveryHeading/);
    assert.doesNotMatch(inboxPageSrc, /deliverySecondaryHint/);
    assert.match(inboxPageSrc, /EmailWorkspacePanel/);
  });

  it("Sent nav uses the workspace outbound list, not the delivery queue", () => {
    assert.match(sentPageSrc, /EmailWorkspacePanel/);
    assert.match(sentPageSrc, /forcedMetric="sent"/);
    assert.doesNotMatch(sentPageSrc, /EmailCommunicationPanel/);
  });
});
