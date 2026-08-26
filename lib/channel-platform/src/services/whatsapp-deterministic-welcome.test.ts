import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWelcomeDeliveredMetadataPatch,
  isGreetingOnlyInboundText,
  readWelcomeDeliveredAt,
  shouldAttemptWhatsAppDeterministicWelcome,
} from "./whatsapp-deterministic-welcome.js";

describe("whatsapp deterministic welcome helpers", () => {
  it("reads legacy conversation welcomeDeliveredAt metadata", () => {
    assert.equal(readWelcomeDeliveredAt(null), null);
    assert.equal(readWelcomeDeliveredAt({}), null);
    assert.equal(readWelcomeDeliveredAt({ welcomeDeliveredAt: "2026-08-24T00:00:00.000Z" }), "2026-08-24T00:00:00.000Z");
  });

  it("builds legacy conversation welcomeDeliveredAt metadata patch", () => {
    assert.deepEqual(buildWelcomeDeliveredMetadataPatch("2026-08-24T01:00:00.000Z"), {
      welcomeDeliveredAt: "2026-08-24T01:00:00.000Z",
    });
    const patch = buildWelcomeDeliveredMetadataPatch();
    assert.equal(typeof patch.welcomeDeliveredAt, "string");
  });

  it("allows welcome only when engagement welcomeDeliveredAt is missing", () => {
    assert.equal(
      shouldAttemptWhatsAppDeterministicWelcome({
        engagement: {
          startedAt: "2026-08-24T12:00:00.000Z",
          aiEmployeeId: "emp-1",
          welcomeDeliveredAt: null,
        },
      }),
      true,
    );
    assert.equal(
      shouldAttemptWhatsAppDeterministicWelcome({
        engagement: {
          startedAt: "2026-08-24T12:00:00.000Z",
          aiEmployeeId: "emp-1",
          welcomeDeliveredAt: "2026-08-24T12:00:00.000Z",
        },
      }),
      false,
    );
    assert.equal(shouldAttemptWhatsAppDeterministicWelcome({ engagement: null }), false);
  });

  it("detects greeting-only inbound text covered by deterministic welcome", () => {
    assert.equal(isGreetingOnlyInboundText("مساء الخير"), true);
    assert.equal(isGreetingOnlyInboundText("صباح الخير"), true);
    assert.equal(isGreetingOnlyInboundText("السلام عليكم"), true);
    assert.equal(isGreetingOnlyInboundText("hello"), true);
    assert.equal(isGreetingOnlyInboundText("عايز أحجز عيادة"), false);
    assert.equal(isGreetingOnlyInboundText("مساء الخير عايز أحجز"), false);
  });
});
