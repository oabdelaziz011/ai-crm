import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LeadReadModel } from "@workspace/application-layer";
import {
  applyCustomerContactFallback,
  applyCustomerContactFallbacks,
} from "./lead-contact-enrichment.ts";

function baseLead(overrides: Partial<LeadReadModel> = {}): LeadReadModel {
  return Object.freeze({
    id: "lead-1",
    tenantId: "co-1",
    name: "Unknown Contact",
    contactPerson: "Unknown Contact",
    email: null,
    phone: null,
    companyName: null,
    ownerId: null,
    owner: null,
    stageId: "stage-1",
    stage: "New",
    sourceId: null,
    source: null,
    expectedValue: null,
    expectedCloseDate: null,
    priority: "normal",
    temperature: null,
    tags: [],
    notes: "",
    lastActivityAt: "2026-10-18T00:00:00.000Z",
    lifecycleStatus: "new",
    pipelineId: "pipe-1",
    currency: "EGP",
    score: 0,
    isQualified: false,
    customerId: "cust-1",
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...overrides,
  }) as LeadReadModel;
}

describe("lead contact enrichment", () => {
  it("fills blank email/phone from the linked customer without inventing values", () => {
    const enriched = applyCustomerContactFallback(baseLead(), {
      id: "cust-1",
      name: "عمر عبدالعزيز",
      email: "omar@example.com",
      phone: "201011404109",
    });
    assert.equal(enriched.email, "omar@example.com");
    assert.equal(enriched.phone, "201011404109");
    assert.equal(enriched.name, "عمر عبدالعزيز");
    assert.equal(enriched.contactPerson, "عمر عبدالعزيز");
  });

  it("replaces WhatsApp channel placeholders with the customer name", () => {
    const enriched = applyCustomerContactFallback(
      baseLead({ name: "WhatsApp +201011404109", contactPerson: "WhatsApp +201011404109" }),
      {
        id: "cust-1",
        name: "عمر عبدالعزيز",
        email: null,
        phone: "+201011404109",
      },
    );
    assert.equal(enriched.name, "عمر عبدالعزيز");
    assert.equal(enriched.phone, "+201011404109");
  });

  it("does not overwrite non-null lead contact fields", () => {
    const enriched = applyCustomerContactFallback(
      baseLead({
        name: "Lead Title",
        email: "lead@example.com",
        phone: "01000000000",
      }),
      {
        id: "cust-1",
        name: "Customer Name",
        email: "customer@example.com",
        phone: "01111111111",
      },
    );
    assert.equal(enriched.email, "lead@example.com");
    assert.equal(enriched.phone, "01000000000");
    assert.equal(enriched.name, "Lead Title");
  });

  it("never invents companyName from the linked customer display name", () => {
    const lead = baseLead({ companyName: null });
    const enriched = applyCustomerContactFallback(lead, {
      id: "cust-1",
      name: "عمر عبدالعزيز",
      email: "omar@example.com",
      phone: "201011404109",
    });
    assert.equal(enriched.companyName, null);
    assert.equal(enriched.email, "omar@example.com");
  });

  it("leaves rows without a customer untouched", () => {
    const lead = baseLead({ customerId: null });
    const enriched = applyCustomerContactFallback(lead, {
      id: "cust-1",
      name: "X",
      email: "x@example.com",
      phone: "1",
    });
    assert.equal(enriched, lead);
  });

  it("batch-applies by customer id map", () => {
    const rows = applyCustomerContactFallbacks(
      [
        baseLead({ id: "a", customerId: "cust-1" }),
        baseLead({ id: "b", customerId: "cust-missing", name: "Kept" }),
      ],
      new Map([
        [
          "cust-1",
          { id: "cust-1", name: "Ada", email: "ada@example.com", phone: "201000000001" },
        ],
      ]),
    );
    assert.equal(rows[0]!.email, "ada@example.com");
    assert.equal(rows[1]!.name, "Kept");
    assert.equal(rows[1]!.email, null);
  });
});
