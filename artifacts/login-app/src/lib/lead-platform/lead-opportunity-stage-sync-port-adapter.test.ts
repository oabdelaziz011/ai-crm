import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("Lead→Opportunity stage sync wiring", () => {
  it("factory wires opportunityStageSync and adapter uses command-service sync only", () => {
    const factory = readFileSync(join(here, "lead-platform-factory.ts"), "utf8");
    const adapter = readFileSync(join(here, "lead-opportunity-stage-sync-port-adapter.ts"), "utf8");
    assert.match(factory, /opportunityStageSync:\s*createLoginAppLeadOpportunityStageSyncPort/);
    assert.match(adapter, /syncOpportunityStageFromLeadLifecycle/);
    assert.match(adapter, /createManual/);
    assert.doesNotMatch(adapter, /fetch\(|WhatsApp|smtp|sendEmail|FakeProvider|allowProviderSend/i);
  });
});
