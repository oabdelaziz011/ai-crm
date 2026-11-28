import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blockedReasonForWhatsAppPurpose,
  computeWhatsAppTemplateSetupReadiness,
  isWhatsAppPurposeApprovedForSend,
} from "./whatsapp-template-readiness";

describe("whatsapp-template-readiness", () => {
  it("marks setup pending and blocks transactional notifies", () => {
    const readiness = computeWhatsAppTemplateSetupReadiness([], { setupPending: true });
    assert.equal(readiness.setupPending, true);
    assert.equal(readiness.readyForTransactionalSends, false);
    assert.equal(
      isWhatsAppPurposeApprovedForSend(readiness, "delivery_worker_dispatch"),
      false,
    );
  });

  it("only APPROVED purposes are sendable", () => {
    const readiness = computeWhatsAppTemplateSetupReadiness([
      {
        id: "1",
        companyId: "c",
        purposeKey: "delivery_worker_dispatch",
        languageCode: "en_US",
        metaTemplateName: "valueor_delivery_worker_dispatch",
        metaTemplateId: "t1",
        metaStatus: "APPROVED",
        category: "UTILITY",
        recipient: "worker",
        lastSyncedAt: null,
        lastError: null,
        lastErrorCode: null,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        companyId: "c",
        purposeKey: "customer_order_status_confirmed",
        languageCode: "en_US",
        metaTemplateName: "valueor_order_confirmed",
        metaTemplateId: "t2",
        metaStatus: "PENDING",
        category: "UTILITY",
        recipient: "customer",
        lastSyncedAt: null,
        lastError: null,
        lastErrorCode: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);
    assert.equal(isWhatsAppPurposeApprovedForSend(readiness, "delivery_worker_dispatch"), true);
    assert.equal(
      isWhatsAppPurposeApprovedForSend(readiness, "customer_order_status_confirmed"),
      false,
    );
    assert.match(
      blockedReasonForWhatsAppPurpose(readiness, "customer_order_status_confirmed") ?? "",
      /approval/i,
    );
  });
});
