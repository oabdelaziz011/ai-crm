import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WhatsAppTemplateSetupError,
  WHATSAPP_TEMPLATE_SETUP_PENDING,
  isMissingCompanyWhatsAppTemplatesRelation,
} from "./whatsapp-template-setup-error";

describe("whatsapp-template-setup-error", () => {
  it("detects missing relation errors", () => {
    assert.equal(
      isMissingCompanyWhatsAppTemplatesRelation({
        code: "42P01",
        message: 'relation "company_whatsapp_templates" does not exist',
      }),
      true,
    );
    assert.equal(
      isMissingCompanyWhatsAppTemplatesRelation({
        code: "PGRST205",
        message: "Could not find the table 'public.company_whatsapp_templates' in the schema cache",
      }),
      true,
    );
    assert.equal(
      isMissingCompanyWhatsAppTemplatesRelation({
        message: "permission denied for table company_whatsapp_templates",
      }),
      false,
    );
  });

  it("exposes WHATSAPP_TEMPLATE_SETUP_PENDING", () => {
    const err = new WhatsAppTemplateSetupError("pending");
    assert.equal(err.code, WHATSAPP_TEMPLATE_SETUP_PENDING);
    assert.equal(err.statusCode, 503);
  });
});
