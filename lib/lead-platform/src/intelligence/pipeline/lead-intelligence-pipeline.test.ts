import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHeuristicLeadIntelligenceProviders } from "../providers/heuristic/index.js";
import { runLeadIntelligencePipeline } from "./lead-intelligence-pipeline.js";

describe("runLeadIntelligencePipeline", () => {
  it("extracts intents, SA country from +966, and score dimensions from AR+EN messages", async () => {
    const providers = createHeuristicLeadIntelligenceProviders();
    const now = new Date().toISOString();

    const { result, observability } = await runLeadIntelligencePipeline(
      {
        companyId: "company-1",
        leadId: "lead-1",
        conversationId: "conv-1",
        captureState: "context_ready",
        lead: {
          phone: "+966501234567",
          email: null,
          title: "Inbound WhatsApp",
          contactName: "Unknown Contact",
          companyName: null,
          channelHints: ["whatsapp"],
          metadata: {},
        },
        messages: [
          {
            id: "m1",
            role: "customer",
            content: "مرحبا، اسمي أحمد من شركة نورك",
            createdAt: now,
          },
          {
            id: "m2",
            role: "agent",
            content: "أهلاً أحمد، كيف نقدر نساعد؟",
            createdAt: now,
          },
          {
            id: "m3",
            role: "customer",
            content: "We need pricing for our team and a demo next week",
            createdAt: now,
          },
          {
            id: "m4",
            role: "customer",
            content: "Also interested in API integration with our CRM",
            createdAt: now,
          },
        ],
      },
      providers,
    );

    assert.ok(result.intents.length >= 1, "expected at least one intent");
    assert.equal(result.country.countryCode.value, "SA");
    assert.ok(result.score.overall);
    assert.ok(result.score.engagement);
    assert.ok(result.score.salesReadiness);
    assert.ok(result.score.businessFit);
    assert.ok(result.score.temperature);
    assert.ok(result.score.temperatureBand);
    assert.ok(Array.isArray(result.buyingSignals));
    assert.equal(result.captureState, "lead");
    assert.ok(result.overallConfidence > 0);
    assert.ok(observability.processingTimeMs >= 0);
    assert.equal(observability.providerFailures, 0);
  });
});
