import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { shouldResumeFailedCampaignRecipient } from "./campaign-recipient-resume.ts";

const serviceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "campaign-execution-service.ts"),
  "utf8",
);

describe("campaign failed recipient resume", () => {
  it("is the decision claimOrResumeRecipient uses", () => {
    assert.match(serviceSource, /shouldResumeFailedCampaignRecipient\(recipient\)/);
  });

  it("does not resume a failed WhatsApp recipient that already has a provider id", () => {
    assert.equal(
      shouldResumeFailedCampaignRecipient({
        channel: "whatsapp",
        status: "failed",
        provider_message_id: "wamid.accepted",
      }),
      false,
    );
  });

  it("does not resume a failed WhatsApp recipient with no provider id", () => {
    assert.equal(
      shouldResumeFailedCampaignRecipient({
        channel: "whatsapp",
        status: "failed",
        provider_message_id: null,
      }),
      false,
    );
    assert.equal(
      shouldResumeFailedCampaignRecipient({
        channel: "whatsapp",
        status: "failed",
        provider_message_id: "  ",
      }),
      false,
    );
  });
});
