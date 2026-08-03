import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertStatusTransition,
  isReopenTransition,
  isTerminalStatus,
} from "../validators/status-transition-validator.js";
import {
  computeSlaCompliancePercent,
  computeSlaDueAt,
  isSlaBreached,
  isSlaWarning,
} from "../services/ticket-sla-service.js";
import { TicketStatusTransitionError, TicketValidationError } from "../errors.js";
import { readPriority, readRequiredString } from "../validators/ticket-validators.js";

describe("status transition validator", () => {
  it("allows open to in_progress", () => {
    assert.doesNotThrow(() => assertStatusTransition("open", "in_progress"));
  });

  it("blocks closed to in_progress without reopen path", () => {
    assert.throws(
      () => assertStatusTransition("closed", "in_progress"),
      TicketStatusTransitionError,
    );
  });

  it("detects reopen transition", () => {
    assert.equal(isReopenTransition("closed", "open"), true);
    assert.equal(isTerminalStatus("resolved"), true);
  });
});

describe("ticket SLA service", () => {
  it("computes SLA due date from priority", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const due = computeSlaDueAt("urgent", now);
    assert.equal(due, "2026-08-01T16:00:00.000Z");
  });

  it("detects SLA breach and warning windows", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    assert.equal(isSlaBreached("2026-08-01T11:00:00.000Z", now), true);
    assert.equal(isSlaWarning("2026-08-01T12:30:00.000Z", now, 1), true);
    assert.equal(computeSlaCompliancePercent(10, 2), 80);
  });
});

describe("ticket validators", () => {
  it("validates required strings and priorities", () => {
    assert.equal(readRequiredString("  hello ", "Field"), "hello");
    assert.throws(() => readRequiredString(" ", "Field"), TicketValidationError);
    assert.equal(readPriority("HIGH"), "high");
    assert.throws(() => readPriority("invalid"), TicketValidationError);
  });
});
