import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ageFromDateOfBirth,
  customerSourceFromChannelType,
  displayCustomerAge,
  isValidDateOfBirthInput,
  lifecycleActionsForStatus,
  normalizeCustomerLifecycleStatus,
  validateLifecycleReason,
} from "./customer-lifecycle.ts";

describe("customer-lifecycle", () => {
  it("maps channel types to acquisition sources", () => {
    assert.equal(customerSourceFromChannelType("whatsapp"), "whatsapp");
    assert.equal(customerSourceFromChannelType("messenger"), "messenger");
    assert.equal(customerSourceFromChannelType("instagram"), "instagram");
    assert.equal(customerSourceFromChannelType("email"), "email");
    assert.equal(customerSourceFromChannelType("sms"), "sms");
    assert.equal(customerSourceFromChannelType("web_chat"), "website");
    assert.equal(customerSourceFromChannelType("manual"), null);
    assert.equal(customerSourceFromChannelType(""), null);
  });

  it("computes age from DOB and never invents DOB from age", () => {
    const now = new Date("2026-09-22T12:00:00Z");
    assert.equal(ageFromDateOfBirth("1990-09-22", now), 36);
    assert.equal(ageFromDateOfBirth("1990-09-23", now), 35);
    assert.equal(ageFromDateOfBirth(null, now), null);
    assert.equal(displayCustomerAge({ dateOfBirth: null, age: 42, now }), 42);
    assert.equal(displayCustomerAge({ dateOfBirth: "2000-01-01", age: 99, now }), 26);
  });

  it("validates DOB input bounds", () => {
    assert.equal(isValidDateOfBirthInput(""), true);
    assert.equal(isValidDateOfBirthInput("1990-05-01"), true);
    assert.equal(isValidDateOfBirthInput("1899-01-01"), false);
    assert.equal(isValidDateOfBirthInput("not-a-date"), false);
  });

  it("requires reason for inactive/blocked and trims whitespace", () => {
    assert.equal(validateLifecycleReason({ nextStatus: "inactive", reason: "  " }).ok, false);
    assert.equal(validateLifecycleReason({ nextStatus: "blocked", reason: "" }).ok, false);
    const ok = validateLifecycleReason({ nextStatus: "inactive", reason: "  no contact  " });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.reason, "no contact");
    assert.deepEqual(validateLifecycleReason({ nextStatus: "active", reason: null }), {
      ok: true,
      reason: null,
    });
  });

  it("exposes action affordances per status", () => {
    assert.deepEqual(lifecycleActionsForStatus("active"), {
      canDeactivate: true,
      canBlock: true,
      canActivate: false,
    });
    assert.deepEqual(lifecycleActionsForStatus("inactive"), {
      canDeactivate: false,
      canBlock: true,
      canActivate: true,
    });
    assert.deepEqual(lifecycleActionsForStatus("blocked"), {
      canDeactivate: false,
      canBlock: false,
      canActivate: true,
    });
    assert.equal(normalizeCustomerLifecycleStatus("BLOCKED"), "blocked");
    assert.equal(normalizeCustomerLifecycleStatus("unknown"), "active");
  });
});
