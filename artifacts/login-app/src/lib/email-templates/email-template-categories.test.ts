import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyEmailTemplateCategory,
  EMAIL_TEMPLATE_CATEGORY_DEFS,
} from "./email-template-categories.ts";

describe("email template category heuristics", () => {
  it("classifies customer service / sales / operations codes", () => {
    assert.equal(
      classifyEmailTemplateCategory({ name: "Welcome Customer", code: "welcome_customer" }),
      "customer_service",
    );
    assert.equal(
      classifyEmailTemplateCategory({ name: "Product Inquiry", code: "product_inquiry" }),
      "sales",
    );
    assert.equal(
      classifyEmailTemplateCategory({ name: "Booking Confirmation", code: "booking_confirmation" }),
      "operations",
    );
  });

  it("falls back to other without inventing DB rows", () => {
    assert.equal(
      classifyEmailTemplateCategory({ name: "Custom Note", code: "custom_note" }),
      "other",
    );
    assert.equal(EMAIL_TEMPLATE_CATEGORY_DEFS.length, 6);
    assert.equal(
      classifyEmailTemplateCategory({ name: "Complaint Apology", code: "complaint_apology" }),
      "complaints",
    );
    assert.equal(
      classifyEmailTemplateCategory({ name: "Ticket Created", code: "ticket_created" }),
      "tickets",
    );
    assert.equal(
      classifyEmailTemplateCategory({ name: "Follow Up", code: "follow_up" }),
      "follow_up",
    );
  });
});
