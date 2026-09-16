/**
 * Automatic Email Acknowledgement orchestrator.
 * Uses existing outbound dispatcher + branding identity. Never calls AI.
 */

import type { ChannelDispatcherPort } from "../../ports/channel-platform-ports.js";
import type { ServiceContext } from "../../types.js";
import {
  buildAcknowledgementClaimExternalId,
  normalizeEmailAcknowledgementConfig,
  selectAcknowledgementTemplate,
  type EmailAcknowledgementConfig,
} from "./email-acknowledgement-config.js";
import {
  evaluateEmailAcknowledgementEligibility,
} from "./email-acknowledgement-eligibility.js";
import {
  acknowledgementHtmlToPlainText,
  buildAcknowledgementOutboundHtml,
} from "./email-acknowledgement-html.js";
import {
  detectAcknowledgementLanguage,
  prepareAcknowledgementDetectionText,
  resolveAcknowledgementLanguageOrNull,
} from "./email-acknowledgement-language.js";
import { buildReplySubject } from "./email-html-utils.js";

export type EmailAcknowledgementBrandingSnapshot = {
  acknowledgement: EmailAcknowledgementConfig;
  signatureHtml: string;
  logoUrl: string | null;
  showLegalFooter: boolean;
  legalText: string;
};

export type EmailAcknowledgementPorts = {
  loadBranding(companyId: string): Promise<EmailAcknowledgementBrandingSnapshot | null>;
  /**
   * Find an existing acknowledgement outbound for this inbound message
   * (by claim external id or metadata.sourceInboundMessageId).
   */
  findExistingAcknowledgement(input: {
    companyId: string;
    conversationId: string;
    inboundMessageId: string;
  }): Promise<{
    id: string;
    status: string;
    dispatchConfirmed: boolean;
    dispatchFailed: boolean;
  } | null>;
  /**
   * Persist a pending outgoing claim with unique external_message_id = valueor-ack:{inboundId}.
   * Returns reused=true when another worker already claimed.
   */
  claimOutgoingAcknowledgement(input: {
    conversationId: string;
    content: string;
    externalMessageId: string;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string; reused: boolean }>;
};

export type EmailAcknowledgementLogEvent =
  | "acknowledgement_candidate"
  | "acknowledgement_language_detected"
  | "acknowledgement_sent"
  | "acknowledgement_skipped_duplicate"
  | "acknowledgement_skipped_automated"
  | "acknowledgement_skipped_no_template"
  | "acknowledgement_skipped_disabled"
  | "acknowledgement_skipped_ineligible"
  | "acknowledgement_failed";

export type TrySendEmailAcknowledgementInput = {
  ctx: ServiceContext;
  dispatcher: ChannelDispatcherPort;
  ports: EmailAcknowledgementPorts;
  companyId: string;
  companyChannelId: string;
  conversationId: string;
  channelSessionId: string;
  inboundMessageId: string;
  externalThreadId: string;
  externalMessageId?: string | null;
  senderExternalId?: string | null;
  companyFromEmail?: string | null;
  subject?: string | null;
  textPlain?: string | null;
  html?: string | null;
  headers?: Record<string, string> | null;
  inboundMetadata?: Record<string, unknown> | null;
  inboundMessageReused?: boolean;
  alreadyExistsAsOutgoing?: boolean;
  log?: (event: EmailAcknowledgementLogEvent, fields: Record<string, unknown>) => void;
};

export type TrySendEmailAcknowledgementResult = {
  sent: boolean;
  skipped: boolean;
  reason: string;
  language?: string;
  templateLanguage?: string;
  outboundMessageId?: string;
};

function safeLog(
  log: TrySendEmailAcknowledgementInput["log"],
  event: EmailAcknowledgementLogEvent,
  fields: Record<string, unknown>,
): void {
  try {
    log?.(event, fields);
  } catch {
    // never break inbound on logging
  }
}

export async function trySendEmailAcknowledgement(
  input: TrySendEmailAcknowledgementInput,
): Promise<TrySendEmailAcknowledgementResult> {
  const baseFields = {
    companyId: input.companyId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
  };

  const eligibility = evaluateEmailAcknowledgementEligibility({
    channelKey: "email",
    fromEmail: input.senderExternalId,
    companyFromEmail: input.companyFromEmail,
    alreadyExistsAsOutgoing: input.alreadyExistsAsOutgoing,
    headers: input.headers,
    subject: input.subject,
    inboundMetadata: input.inboundMetadata,
    inboundMessageReused: input.inboundMessageReused,
  });

  if (!eligibility.eligible) {
    const event: EmailAcknowledgementLogEvent =
      eligibility.reason.includes("auto") ||
      eligibility.reason.includes("bounce") ||
      eligibility.reason.includes("precedence") ||
      eligibility.reason.includes("subject_automated") ||
      eligibility.reason.includes("acknowledgement")
        ? "acknowledgement_skipped_automated"
        : eligibility.reason.includes("reused") || eligibility.reason.includes("echo")
          ? "acknowledgement_skipped_duplicate"
          : "acknowledgement_skipped_ineligible";
    safeLog(input.log, event, { ...baseFields, result: eligibility.reason });
    return { sent: false, skipped: true, reason: eligibility.reason };
  }

  safeLog(input.log, "acknowledgement_candidate", { ...baseFields, result: "candidate" });

  let branding: EmailAcknowledgementBrandingSnapshot | null = null;
  try {
    branding = await input.ports.loadBranding(input.companyId);
  } catch (error) {
    safeLog(input.log, "acknowledgement_failed", {
      ...baseFields,
      result: "branding_load_failed",
      error: error instanceof Error ? error.message : "branding_load_failed",
    });
    return { sent: false, skipped: true, reason: "branding_load_failed" };
  }

  const config = normalizeEmailAcknowledgementConfig(branding?.acknowledgement);
  if (!config.enabled) {
    safeLog(input.log, "acknowledgement_skipped_disabled", { ...baseFields, result: "disabled" });
    return { sent: false, skipped: true, reason: "disabled" };
  }

  const existing = await input.ports.findExistingAcknowledgement({
    companyId: input.companyId,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
  });
  if (existing) {
    if (existing.dispatchFailed && !existing.dispatchConfirmed) {
      // Allow retry path via re-dispatch of the same claim row below.
    } else {
      safeLog(input.log, "acknowledgement_skipped_duplicate", {
        ...baseFields,
        result: "already_acknowledged",
        outboundMessageId: existing.id,
      });
      return {
        sent: false,
        skipped: true,
        reason: "already_acknowledged",
        outboundMessageId: existing.id,
      };
    }
  }

  const detectionText = prepareAcknowledgementDetectionText({
    subject: input.subject,
    textPlain: input.textPlain,
    html: input.html,
  });
  const detection = detectAcknowledgementLanguage(detectionText);
  const detectedLanguage = resolveAcknowledgementLanguageOrNull(detection);
  safeLog(input.log, "acknowledgement_language_detected", {
    ...baseFields,
    language: detectedLanguage ?? detection.language,
    result: detection.reason,
    confidence: detection.confidence,
  });

  const selected = selectAcknowledgementTemplate({
    config,
    detectedLanguage,
  });
  if (!selected) {
    safeLog(input.log, "acknowledgement_skipped_no_template", {
      ...baseFields,
      language: detectedLanguage,
      result: "no_template",
    });
    return { sent: false, skipped: true, reason: "no_template", language: detectedLanguage ?? undefined };
  }

  const html = buildAcknowledgementOutboundHtml({
    bodyText: selected.template.body,
    signatureHtml: branding?.signatureHtml ?? "",
    logoUrl: branding?.logoUrl ?? null,
    legalFooterEnabled: branding?.showLegalFooter === true,
    legalFooterText: branding?.legalText ?? "",
  });
  const text = acknowledgementHtmlToPlainText(html) || selected.template.body;
  const claimExternalId = buildAcknowledgementClaimExternalId(input.inboundMessageId);
  const emailAutomation = {
    type: "acknowledgement",
    language: selected.language,
    templateId: `branding.email.acknowledgement.${selected.template.language}`,
    sourceInboundMessageId: input.inboundMessageId,
    sourceExternalMessageId: input.externalMessageId ?? null,
    preserveClaimExternalId: true,
  };

  let outboundMessageId = existing?.id;
  if (!outboundMessageId) {
    const claim = await input.ports.claimOutgoingAcknowledgement({
      conversationId: input.conversationId,
      content: text,
      externalMessageId: claimExternalId,
      metadata: {
        emailAutomation,
        htmlSanitized: html,
        recipientEmail: input.senderExternalId,
        inReplyTo: input.externalMessageId ?? undefined,
        emailSubject: buildReplySubject(input.subject ?? ""),
        emailReferences: input.externalMessageId ? [input.externalMessageId] : undefined,
        threadRootMessageId: input.externalThreadId,
      },
    });
    outboundMessageId = claim.id;
    if (claim.reused) {
      const reusedExisting = await input.ports.findExistingAcknowledgement({
        companyId: input.companyId,
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
      });
      const canRetry =
        Boolean(reusedExisting?.dispatchFailed) && !reusedExisting?.dispatchConfirmed;
      if (!canRetry) {
        safeLog(input.log, "acknowledgement_skipped_duplicate", {
          ...baseFields,
          result: "claim_reused",
          outboundMessageId,
        });
        return {
          sent: false,
          skipped: true,
          reason: "claim_reused",
          outboundMessageId,
          language: selected.language,
          templateLanguage: selected.language,
        };
      }
    }
  }

  try {
    await input.dispatcher.dispatch(input.ctx, {
      companyId: input.companyId,
      companyChannelId: input.companyChannelId,
      channelKey: "email",
      conversationId: input.conversationId,
      channelSessionId: input.channelSessionId,
      externalThreadId: input.externalThreadId,
      text,
      outboundMessageId,
      persistConversationMessage: false,
      metadata: {
        emailAutomation,
        htmlSanitized: html,
        recipientEmail: input.senderExternalId,
        inReplyTo: input.externalMessageId ?? undefined,
        emailSubject: buildReplySubject(input.subject ?? ""),
        emailReferences: input.externalMessageId ? [input.externalMessageId] : undefined,
        threadRootMessageId: input.externalThreadId,
      },
    });

    safeLog(input.log, "acknowledgement_sent", {
      ...baseFields,
      language: selected.language,
      templateId: emailAutomation.templateId,
      result: "sent",
      outboundMessageId,
    });
    return {
      sent: true,
      skipped: false,
      reason: "sent",
      language: selected.language,
      templateLanguage: selected.language,
      outboundMessageId,
    };
  } catch (error) {
    safeLog(input.log, "acknowledgement_failed", {
      ...baseFields,
      language: selected.language,
      templateId: emailAutomation.templateId,
      result: "send_failed",
      outboundMessageId,
      error: error instanceof Error ? error.message : "send_failed",
    });
    return {
      sent: false,
      skipped: false,
      reason: "send_failed",
      language: selected.language,
      templateLanguage: selected.language,
      outboundMessageId,
    };
  }
}
