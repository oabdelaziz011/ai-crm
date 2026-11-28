import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertLegacyRegistryTemplateSendable } from "./whatsapp-outbound-message-policy.ts";
import { WhatsAppTemplateConfigurationError } from "./whatsapp-template-configuration-error.ts";

const approvedCompany = {
  purposeKey: "appointment_created",
  metaTemplateName: "appointment_confirmation",
  languageCode: "en_US",
  metaStatus: "APPROVED",
};

describe("legacy queue APPROVED enforcement", () => {
  it("allows APPROVED company-scoped legacy templates", () => {
    assert.doesNotThrow(() =>
      assertLegacyRegistryTemplateSendable({
        templateId: "appointment_confirmation",
        event: "appointment_created",
        languageCode: "en_US",
        companyTemplate: approvedCompany,
      }),
    );
  });

  it("blocks PENDING, REJECTED, PAUSED, and missing company templates", () => {
    for (const status of ["PENDING", "REJECTED", "PAUSED", "DISABLED"] as const) {
      assert.throws(
        () =>
          assertLegacyRegistryTemplateSendable({
            templateId: "appointment_confirmation",
            event: "appointment_created",
            languageCode: "en_US",
            companyTemplate: { ...approvedCompany, metaStatus: status },
          }),
        (err: unknown) =>
          err instanceof WhatsAppTemplateConfigurationError &&
          err.code === "template_not_approved",
      );
    }

    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "appointment_confirmation",
          event: "appointment_created",
          languageCode: "en_US",
          companyTemplate: null,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_configured",
    );
  });

  it("blocks template name mismatch (other-company / wrong binding)", () => {
    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "appointment_confirmation",
          event: "appointment_created",
          languageCode: "en_US",
          companyTemplate: {
            ...approvedCompany,
            metaTemplateName: "other_company_template",
          },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError && err.code === "template_not_allowed",
    );
  });

  it("fails closed when company catalog lookup errors", () => {
    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "appointment_confirmation",
          event: "appointment_created",
          languageCode: "en_US",
          companyTemplate: null,
          companyTemplateLookupError: true,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_configured" &&
        /Failing closed/i.test(err.message),
    );
  });

  it("fails closed when optional Meta catalog is provided and template is not APPROVED there", () => {
    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "appointment_confirmation",
          event: "appointment_created",
          languageCode: "en_US",
          companyTemplate: approvedCompany,
          approvedTemplates: [
            { name: "appointment_confirmation", language: "en_US", status: "PENDING" },
          ],
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_approved",
    );
  });

  it("permits connection_test hello_world only", () => {
    assert.doesNotThrow(() =>
      assertLegacyRegistryTemplateSendable({
        templateId: "hello_world",
        event: "connection_test",
        languageCode: "en_US",
        companyTemplate: null,
      }),
    );

    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "hello_world",
          event: "appointment_created",
          languageCode: "en_US",
          companyTemplate: approvedCompany,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "hello_world_not_allowed",
    );
  });

  it("never allows generic_system transactional fallback", () => {
    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "generic_system",
          event: "generic_system",
          languageCode: "en",
          companyTemplate: {
            purposeKey: "generic_system",
            metaTemplateName: "generic_system",
            languageCode: "en",
            metaStatus: "APPROVED",
          },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "generic_system_blocked",
    );
  });
});
