import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("quote-send CRM sync contract", () => {
  it("only documents sync after confirmed send and never drafts", () => {
    const syncSource = readFileSync(
      fileURLToPath(new URL("./quote-send-crm-sync.ts", import.meta.url)),
      "utf8",
    );
    const serviceSource = readFileSync(
      fileURLToPath(new URL("./quote-send-service.ts", import.meta.url)),
      "utf8",
    );
    assert.match(syncSource, /confirmed successful send|status === "sent"|proposal_sent/);
    assert.match(serviceSource, /afterConfirmedSend/);
    assert.match(serviceSource, /notifyConfirmedSend/);
    // Failures must not call the hook from recordFailure.
    const failureSection = serviceSource.slice(serviceSource.indexOf("private async recordFailure"));
    assert.equal(/notifyConfirmedSend/.test(failureSection), false);
  });

  it("loads opportunity via resolved opportunityId (not only input.opportunityId)", () => {
    const syncSource = readFileSync(
      fileURLToPath(new URL("./quote-send-crm-sync.ts", import.meta.url)),
      "utf8",
    );
    assert.match(syncSource, /getOpportunity\(input\.companyId,\s*opportunityId\)/);
    assert.equal(/getOpportunity\(input\.companyId,\s*input\.opportunityId\)/.test(syncSource), false);
  });
});
