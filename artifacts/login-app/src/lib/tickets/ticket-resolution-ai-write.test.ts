/**
 * Client helpers for ticket resolution AI — contract smoke tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ticket-resolution-ai-write client", () => {
  it("posts to /tickets/ai/resolution-message and never implies send", () => {
    const src = readFileSync(join(__dirname, "ticket-resolution-ai-write.ts"), "utf8");
    assert.match(src, /\/tickets\/ai\/resolution-message/);
    assert.match(src, /neverSend:\s*true/);
    assert.doesNotMatch(src, /dispatchOutbound/);
    assert.doesNotMatch(src, /closeTicket/);
  });

  it("dialog falls back to template on AI failure and disables send while generating", () => {
    const dialog = readFileSync(
      join(__dirname, "../../components/tickets/ticket-close-notify-dialog.tsx"),
      "utf8",
    );
    assert.match(dialog, /aiFallbackHint/);
    assert.match(dialog, /requestTicketResolutionAiDraft/);
    assert.match(dialog, /aiGenerating/);
    assert.match(dialog, /disabled=\{busy \|\| !message\.trim\(\)\}/);
    assert.match(dialog, /sendLock/);
    assert.match(dialog, /messageLanguage/);
    assert.match(dialog, /regenerate/);
  });

  it("close notify still uses same-channel outbound client (unchanged routing)", () => {
    const notify = readFileSync(join(__dirname, "ticket-close-customer-notify.ts"), "utf8");
    assert.match(notify, /notifyTicketResolvedOnOriginChannel|same.channel|originChannel|conversationId/i);
    assert.doesNotMatch(notify, /requestTicketResolutionAiDraft/);
  });
});
