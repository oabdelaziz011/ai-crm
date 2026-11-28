import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertLegacyRegistryTemplateSendable,
  planPurposeTemplate,
  planSessionFreeformText,
  planWhatsAppOutbound,
  type CompanyTemplateOutboundRecord,
} from "./whatsapp-outbound-message-policy";
import { WhatsAppTemplateConfigurationError } from "./whatsapp-template-configuration-error";
import { mapMetaWhatsAppTemplateProviderError } from "./whatsapp-template-configuration-error";
import type { CompanyWhatsAppTemplateBindings } from "../templates/whatsapp-purpose-templates";

const approvedWorkerBinding: CompanyWhatsAppTemplateBindings = {
  delivery_worker_dispatch: {
    metaName: "valueor_delivery_worker_dispatch",
    language: "en_US",
    approvalStatus: "approved",
  },
};

const approvedWorkerCompany: CompanyTemplateOutboundRecord = {
  purposeKey: "delivery_worker_dispatch",
  metaTemplateName: "valueor_delivery_worker_dispatch",
  languageCode: "en_US",
  metaStatus: "APPROVED",
};

const workerParams = {
  orderNumber: "SO-1",
  customerName: "Omar",
  deliveryAddress: "Nasr City",
  customerPhone: "+201011404109",
  totalAmount: "100 EGP",
};

describe("whatsapp-outbound-message-policy", () => {
  it("rejects freeform when session window is closed", () => {
    assert.throws(
      () =>
        planSessionFreeformText({
          text: "hello",
          sessionWindowOpen: false,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "session_window_closed_no_template",
    );
  });

  it("allows freeform when session window is active (AI / customer session replies)", () => {
    const plan = planSessionFreeformText({
      text: "Order confirmed",
      sessionWindowOpen: true,
    });
    assert.equal(plan.mode, "freeform_text");
    assert.equal(plan.templateId, null);
    assert.equal(plan.text, "Order confirmed");
  });

  it("rejects purpose template without synced company row (ignores frontend approval)", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          bindings: approvedWorkerBinding,
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_configured",
    );
  });

  it("accepts APPROVED company template with valid parameters", () => {
    const plan = planPurposeTemplate({
      purpose: "delivery_worker_dispatch",
      params: workerParams,
      companyTemplate: approvedWorkerCompany,
      approvedTemplates: [
        { name: "valueor_delivery_worker_dispatch", language: "en_US", status: "APPROVED" },
      ],
    });
    assert.equal(plan.mode, "template");
    assert.equal(plan.templateId, "valueor_delivery_worker_dispatch");
    assert.deepEqual(plan.bodyParameters, [
      "SO-1",
      "Omar",
      "Nasr City",
      "+201011404109",
      "100 EGP",
    ]);
  });

  it("rejects PENDING company templates", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          companyTemplate: { ...approvedWorkerCompany, metaStatus: "PENDING" },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_approved",
    );
  });

  it("rejects REJECTED company templates", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          companyTemplate: { ...approvedWorkerCompany, metaStatus: "REJECTED" },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_approved",
    );
  });

  it("rejects PAUSED company templates", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          companyTemplate: { ...approvedWorkerCompany, metaStatus: "PAUSED" },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_approved",
    );
  });

  it("rejects wrong language against Meta catalog", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          companyTemplate: approvedWorkerCompany,
          approvedTemplates: [
            { name: "valueor_delivery_worker_dispatch", language: "ar", status: "APPROVED" },
          ],
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_language_mismatch",
    );
  });

  it("rejects unapproved Meta catalog status even if company row says APPROVED", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          companyTemplate: approvedWorkerCompany,
          approvedTemplates: [
            { name: "valueor_delivery_worker_dispatch", language: "en_US", status: "PENDING" },
          ],
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_approved",
    );
  });

  it("blocks hello_world for worker notification", () => {
    assert.throws(
      () =>
        planPurposeTemplate({
          purpose: "delivery_worker_dispatch",
          params: workerParams,
          companyTemplate: {
            ...approvedWorkerCompany,
            metaTemplateName: "hello_world",
          },
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "hello_world_not_allowed",
    );
  });

  it("blocks generic_system everywhere transactional", () => {
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

  it("requires APPROVED company template for legacy registry sends", () => {
    assert.throws(
      () =>
        assertLegacyRegistryTemplateSendable({
          templateId: "appointment_confirmation",
          event: "appointment_created",
          languageCode: "en",
        }),
      (err: unknown) =>
        err instanceof WhatsAppTemplateConfigurationError &&
        err.code === "template_not_configured",
    );
  });

  it("customer status uses freeform inside window and APPROVED company template outside", () => {
    const inside = planWhatsAppOutbound({
      purpose: "customer_order_status_confirmed",
      params: { customerName: "Omar", orderNumber: "SO-1" },
      companyTemplate: {
        purposeKey: "customer_order_status_confirmed",
        metaTemplateName: "valueor_order_confirmed",
        languageCode: "en_US",
        metaStatus: "APPROVED",
      },
      sessionWindowOpen: true,
      freeformText: "Hi Omar, order SO-1 is confirmed.",
    });
    assert.equal(inside.mode, "freeform_text");

    const outside = planWhatsAppOutbound({
      purpose: "customer_order_status_confirmed",
      params: { customerName: "Omar", orderNumber: "SO-1" },
      companyTemplate: {
        purposeKey: "customer_order_status_confirmed",
        metaTemplateName: "valueor_order_confirmed",
        languageCode: "en_US",
        metaStatus: "APPROVED",
      },
      approvedTemplates: [
        { name: "valueor_order_confirmed", language: "en_US", status: "APPROVED" },
      ],
      sessionWindowOpen: false,
      freeformText: "Hi Omar, order SO-1 is confirmed.",
    });
    assert.equal(outside.mode, "template");
    assert.equal(outside.templateId, "valueor_order_confirmed");
  });

  it("worker notification outside session window requires APPROVED company template", () => {
    const plan = planWhatsAppOutbound({
      purpose: "delivery_worker_dispatch",
      params: workerParams,
      companyTemplate: approvedWorkerCompany,
      approvedTemplates: [
        { name: "valueor_delivery_worker_dispatch", language: "en_US", status: "APPROVED" },
      ],
      sessionWindowOpen: false,
    });
    assert.equal(plan.mode, "template");
  });

  it("maps Meta #132001 to provider_template_missing", () => {
    const mapped = mapMetaWhatsAppTemplateProviderError(
      "(#132001) Template name does not exist in the translation",
      { purpose: "delivery_worker_dispatch", metaName: "generic_system" },
    );
    assert.ok(mapped);
    assert.equal(mapped?.code, "provider_template_missing");
  });

  it("does not provide Email fallback codes", () => {
    try {
      planPurposeTemplate({
        purpose: "delivery_worker_dispatch",
        params: workerParams,
        bindings: {},
      });
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof WhatsAppTemplateConfigurationError);
      assert.doesNotMatch(error.message, /email/i);
      assert.notEqual(error.code, "email_fallback" as never);
    }
  });
});
