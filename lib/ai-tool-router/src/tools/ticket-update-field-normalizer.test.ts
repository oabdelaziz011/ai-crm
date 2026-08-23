import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectUpdateTicketFieldIntent,
  extractUpdateTicketValueFromMessage,
  normalizeUpdateTicketInput,
} from "./ticket-update-field-normalizer.js";

describe("ticket-update-field-normalizer", () => {
  it("maps Arabic عنوان التذكرة → subject", () => {
    assert.equal(
      detectUpdateTicketFieldIntent("حدّث عنوان التذكرة TKT-000093 إلى تأخير في الرد"),
      "subject",
    );
  });

  it("maps Arabic موضوع التذكرة → subject", () => {
    assert.equal(detectUpdateTicketFieldIntent("حدث موضوع التذكرة إلى مشكلة جديدة"), "subject");
  });

  it("maps Arabic وصف التذكرة → description", () => {
    assert.equal(
      detectUpdateTicketFieldIntent("حدّث وصف التذكرة TKT-000093 إلى تم التواصل مع العميل"),
      "description",
    );
  });

  it("maps Arabic تفاصيل التذكرة → description", () => {
    assert.equal(detectUpdateTicketFieldIntent("حدث تفاصيل الشكوى إلى ملاحظة"), "description");
  });

  it("maps English subject → subject", () => {
    assert.equal(detectUpdateTicketFieldIntent("update ticket subject to Billing issue"), "subject");
  });

  it("maps English description → description", () => {
    assert.equal(detectUpdateTicketFieldIntent("update ticket description to Called customer"), "description");
  });

  it("subject-only rewrite moves misplaced description value to subject", () => {
    const msg = "حدّث عنوان التذكرة TKT-000093 إلى تأخير في الرد";
    const normalized = normalizeUpdateTicketInput(
      { ticketId: "TKT-000093", description: "تأخير في الرد" },
      msg,
    );
    assert.deepEqual(normalized, {
      ticketId: "TKT-000093",
      subject: "تأخير في الرد",
    });
    assert.equal("description" in normalized, false);
  });

  it("description-only rewrite keeps description and drops subject", () => {
    const msg = "حدّث وصف التذكرة TKT-000093 إلى تم التواصل مع العميل";
    const normalized = normalizeUpdateTicketInput(
      { ticketId: "TKT-000093", subject: "تم التواصل مع العميل" },
      msg,
    );
    assert.deepEqual(normalized, {
      ticketId: "TKT-000093",
      description: "تم التواصل مع العميل",
    });
    assert.equal("subject" in normalized, false);
  });

  it("subject-only rewrite does not include description when LLM sent both", () => {
    const msg = "حدّث عنوان التذكرة TKT-000093 إلى عنوان جديد";
    const normalized = normalizeUpdateTicketInput(
      {
        ticketId: "TKT-000093",
        subject: "عنوان جديد",
        description: "should-not-be-sent",
      },
      msg,
    );
    assert.equal(normalized.subject, "عنوان جديد");
    assert.equal("description" in normalized, false);
  });

  it("does not rewrite when intent is ambiguous", () => {
    const msg = "حدّث عنوان ووصف التذكرة TKT-000093";
    const args = { ticketId: "TKT-000093", description: "x" };
    assert.equal(normalizeUpdateTicketInput(args, msg), args);
    assert.equal(detectUpdateTicketFieldIntent(msg), "ambiguous");
  });

  it("extracts trailing value after إلى", () => {
    assert.equal(
      extractUpdateTicketValueFromMessage("حدّث عنوان التذكرة TKT-000093 إلى تأخير في الرد"),
      "تأخير في الرد",
    );
  });
});
