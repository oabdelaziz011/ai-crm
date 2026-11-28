/**
 * Company template readiness for Settings + Sales UI.
 * Meta APPROVED is the only sendable status.
 */

import {
  WHATSAPP_PURPOSE_TEMPLATE_SPECS,
  type WhatsAppMessagePurpose,
} from "@/lib/notifications/providers/whatsapp/templates/whatsapp-purpose-templates";
import { WHATSAPP_TRANSACTIONAL_PURPOSES } from "@/lib/notifications/providers/whatsapp/services/whatsapp-company-templates";
import { isMetaApprovedTemplateStatus } from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-meta-status";
import type { WhatsAppCompanyTemplateRow } from "@/lib/notifications/providers/whatsapp/services/whatsapp-api-client";

export type WhatsAppPurposeReadiness = {
  purpose: WhatsAppMessagePurpose;
  recipient: "customer" | "worker";
  metaTemplateName: string;
  metaStatus: string;
  approved: boolean;
  blockedReason: string | null;
  blockedOperations: string[];
};

export type WhatsAppTemplateSetupReadiness = {
  setupPending: boolean;
  readyForTransactionalSends: boolean;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  pausedCount: number;
  notCreatedCount: number;
  purposes: WhatsAppPurposeReadiness[];
};

const PURPOSE_OPERATIONS: Record<WhatsAppMessagePurpose, string[]> = {
  connection_test: ["connection_test"],
  delivery_worker_dispatch: [
    "delivery_worker_whatsapp_notify",
    "assign_delivery_whatsapp_notify",
  ],
  delivery_worker_cancellation: ["cancellation_worker_whatsapp_notify"],
  customer_order_status_pending_approval: ["customer_status_whatsapp_notify"],
  customer_order_status_confirmed: ["customer_status_whatsapp_notify", "approve_order_whatsapp_notify"],
  customer_order_status_processing: ["customer_status_whatsapp_notify"],
  customer_order_status_out_for_delivery: ["customer_status_whatsapp_notify"],
  customer_order_status_delivered: ["customer_status_whatsapp_notify"],
  customer_order_status_cancelled: ["customer_status_whatsapp_notify"],
};

export function computeWhatsAppTemplateSetupReadiness(
  templates: WhatsAppCompanyTemplateRow[] | null | undefined,
  options?: { setupPending?: boolean },
): WhatsAppTemplateSetupReadiness {
  if (options?.setupPending) {
    return {
      setupPending: true,
      readyForTransactionalSends: false,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      pausedCount: 0,
      notCreatedCount: WHATSAPP_TRANSACTIONAL_PURPOSES.length,
      purposes: WHATSAPP_TRANSACTIONAL_PURPOSES.map((purpose) => {
        const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
        return {
          purpose,
          recipient: spec.recipient,
          metaTemplateName: spec.recommendedMetaName,
          metaStatus: "NOT_CREATED",
          approved: false,
          blockedReason:
            "WhatsApp template storage is not ready. An administrator must finish template setup.",
          blockedOperations: PURPOSE_OPERATIONS[purpose],
        };
      }),
    };
  }

  const byPurpose = new Map(
    (templates ?? []).map((t) => [t.purposeKey, t] as const),
  );

  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;
  let pausedCount = 0;
  let notCreatedCount = 0;

  const purposes: WhatsAppPurposeReadiness[] = WHATSAPP_TRANSACTIONAL_PURPOSES.map((purpose) => {
    const spec = WHATSAPP_PURPOSE_TEMPLATE_SPECS[purpose];
    const row = byPurpose.get(purpose);
    const metaStatus = String(row?.metaStatus ?? "NOT_CREATED").toUpperCase();
    const approved = isMetaApprovedTemplateStatus(metaStatus);
    if (approved) approvedCount += 1;
    else if (metaStatus === "PENDING" || metaStatus === "IN_APPEAL") pendingCount += 1;
    else if (metaStatus === "REJECTED") rejectedCount += 1;
    else if (metaStatus === "PAUSED" || metaStatus === "DISABLED") pausedCount += 1;
    else notCreatedCount += 1;

    let blockedReason: string | null = null;
    if (!approved) {
      if (metaStatus === "PENDING" || metaStatus === "IN_APPEAL") {
        blockedReason = `Template "${spec.recommendedMetaName}" is waiting for Meta approval.`;
      } else if (metaStatus === "REJECTED") {
        blockedReason = `Template "${spec.recommendedMetaName}" was rejected by Meta.`;
      } else if (metaStatus === "PAUSED" || metaStatus === "DISABLED") {
        blockedReason = `Template "${spec.recommendedMetaName}" is ${metaStatus} on Meta.`;
      } else {
        blockedReason = `Template "${spec.recommendedMetaName}" is not created or synced yet. Use Provision standard templates.`;
      }
    }

    return {
      purpose,
      recipient: spec.recipient,
      metaTemplateName: row?.metaTemplateName ?? spec.recommendedMetaName,
      metaStatus,
      approved,
      blockedReason,
      blockedOperations: approved ? [] : PURPOSE_OPERATIONS[purpose],
    };
  });

  return {
    setupPending: false,
    readyForTransactionalSends: approvedCount === WHATSAPP_TRANSACTIONAL_PURPOSES.length,
    approvedCount,
    pendingCount,
    rejectedCount,
    pausedCount,
    notCreatedCount,
    purposes,
  };
}

export function isWhatsAppPurposeApprovedForSend(
  readiness: WhatsAppTemplateSetupReadiness,
  purpose: WhatsAppMessagePurpose,
): boolean {
  return readiness.purposes.find((p) => p.purpose === purpose)?.approved === true;
}

export function blockedReasonForWhatsAppPurpose(
  readiness: WhatsAppTemplateSetupReadiness,
  purpose: WhatsAppMessagePurpose,
): string | null {
  return readiness.purposes.find((p) => p.purpose === purpose)?.blockedReason ?? null;
}
