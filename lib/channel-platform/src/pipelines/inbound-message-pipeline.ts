import { randomUUID } from "@workspace/platform-crypto";
import type { ChannelAdapterRegistryPort } from "../ports/channel-adapter-port.js";
import type { ChannelDispatcherPort, ChannelPlatformPorts } from "../ports/channel-platform-ports.js";
import type {
  ChannelInboundEventRepository,
  ChannelSessionRepository,
} from "../repositories/channel-platform-repositories.js";
import { CHANNEL_PLATFORM_PERMISSIONS } from "../constants.js";
import {
  CompanyChannelNotFoundError,
  PermissionDeniedError,
  ValidationError,
} from "../errors.js";
import type { ResolvedCompanyChannel, ServiceContext } from "../types.js";
import { ChannelSessionEngine } from "../engines/channel-session-engine.js";
import type { InboundRouteRequestDto, InboundRouteResponseDto } from "../dto/channel-dto.js";
import type {
  ChannelWorkflowResolution,
  ChannelWorkflowResolver,
} from "../services/channel-workflow-resolver.js";
import { dispatchAutomationOutboundMessages } from "../services/dispatch-automation-outbound.js";
import { traceParsedInboundMessage } from "../debug/interactive-if-trace-debug.js";
import {
  hasValidInboundContent,
  resolveInboundMessageText,
} from "./inbound-message-content.js";
import {
  buildPipelineValidationBeforePayload,
  logPipelineValidation,
  PIPELINE_VALIDATION_IMPL,
} from "./pipeline-validation-log.js";
import type { WhatsAppDirectOutboundBypassOptions } from "../adapters/whatsapp/whatsapp-direct-outbound-bypass.js";
import {
  sendWhatsAppDirectOutboundBypass,
  WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
  isWhatsAppDirectOutboundBypassAllowed,
} from "../adapters/whatsapp/whatsapp-direct-outbound-bypass.js";
import { logWhatsApp, logWhatsAppError } from "../debug/whatsapp-ai-pipeline-log.js";
import {
  waPerfMarkInboundExecution,
  waPerfMeasure,
  waPerfNoteSkipped,
} from "../debug/whatsapp-pipeline-perf.js";
import {
  waTraceBindAutomationRun,
  waTraceBindConversation,
  waTraceBindInboundExternalMessageId,
  waTraceBindSession,
  waTraceBindWorkflow,
  waTraceNoteError,
} from "../debug/whatsapp-conversation-trace-bridge.js";
import { isBookingTransferIntent } from "../utils/workflow-transfer-intent.js";
import {
  buildEngagementMetadataPatch,
  DEFAULT_AI_EMPLOYEE_SESSION_TIMEOUT_MINUTES,
  hasEngagementWelcomeDelivered,
  markEngagementWelcomeDelivered,
  readAiEmployeeEngagement,
  resolveAiEmployeeEngagement,
  type AiEmployeeEngagementState,
} from "../services/ai-employee-engagement-session.js";
import {
  isGreetingOnlyInboundText,
  shouldAttemptWhatsAppDeterministicWelcome,
} from "../services/whatsapp-deterministic-welcome.js";
import {
  claimInteractiveReplyDedupe,
  extractInteractiveReplyContextIdFromPayload,
  extractInteractiveReplyIdFromPayload,
  INTERACTIVE_REPLY_DEDUPE_TTL_MS,
  releaseInteractiveReplyDedupe,
} from "../utils/interactive-reply-dedupe.js";
import {
  toEmailRoutingClassificationRuntime,
  toEmailRoutingDecisionRuntime,
  type EmailRoutingClassificationRuntime,
  type EmailRoutingClassifierPort,
  type EmailRoutingDecisionRuntime,
  type EmailRoutingEnginePort,
} from "../ports/email-routing-classifier-port.js";
import type { EmailRoutingTicketActionRuntimeResult } from "../ports/email-routing-ticket-action-port.js";
import type { CampaignDeliveryReconcilePort } from "../ports/campaign-delivery-reconcile-port.js";

const IN_FLIGHT_INBOUND_TTL_MS = 2 * 60 * 1000;

function readActiveWorkflowTransfer(
  metadata: Record<string, unknown> | null | undefined,
): { flowId: string } | null {
  if (!metadata) return null;
  const transfer = metadata.inboundWorkflowTransfer;
  if (!transfer || typeof transfer !== "object") return null;
  const record = transfer as Record<string, unknown>;
  if (record.active !== true) return null;
  const flowId = typeof record.flowId === "string" ? record.flowId.trim() : "";
  return flowId ? { flowId } : null;
}

function buildClearedWorkflowTransfer(
  previous: unknown,
  reason: string,
): Record<string, unknown> {
  const base =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? { ...(previous as Record<string, unknown>) }
      : {};
  return {
    ...base,
    active: false,
    clearedAt: new Date().toISOString(),
    clearedReason: reason,
  };
}

const TERMINAL_WORKFLOW_LIFECYCLES = new Set(["completed", "failed", "cancelled"]);

function readTransferableFlowId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const value = metadata.transferableFlowId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isFreshInboundTimestamp(value: string | null | undefined): boolean {
  if (!value) return true;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return true;
  return Date.now() - parsed < IN_FLIGHT_INBOUND_TTL_MS;
}

function shouldSkipDuplicateInbound(duplicate: {
  processing_status: string;
  runtime_execution_id?: string | null;
  updated_at?: string | null;
  received_at?: string | null;
}): boolean {
  if (duplicate.processing_status === "processed") return true;
  if (duplicate.processing_status === "failed" && duplicate.runtime_execution_id) return true;
  if (
    (duplicate.processing_status === "processing" || duplicate.processing_status === "received") &&
    isFreshInboundTimestamp(duplicate.updated_at ?? duplicate.received_at)
  ) {
    return true;
  }
  return false;
}

/** Runtime already ran for this inbound event — do not execute AI/outbound again on stale retries. */
function shouldSkipInboundRuntimeRetry(inboundEvent: {
  runtime_execution_id?: string | null;
}): boolean {
  return Boolean(
    typeof inboundEvent.runtime_execution_id === "string" && inboundEvent.runtime_execution_id.trim(),
  );
}

function buildInboundIncomingMetadata(
  inboundEventId: string,
  request: InboundRouteRequestDto,
  normalized: { attachments?: unknown; metadata?: Record<string, unknown> },
): Record<string, unknown> {
  return {
    channelKey: request.channelKey,
    source: request.source,
    correlationId: inboundEventId,
    attachments: normalized.attachments,
    ...(normalized.metadata ?? {}),
  };
}

export class InboundMessagePipeline {
  constructor(
    private readonly ports: ChannelPlatformPorts,
    private readonly adapterRegistry: ChannelAdapterRegistryPort,
    private readonly sessionEngine: ChannelSessionEngine,
    private readonly dispatcher: ChannelDispatcherPort,
    private readonly inboundRepository: ChannelInboundEventRepository,
    private readonly sessionRepository: ChannelSessionRepository,
    private readonly workflowResolver?: ChannelWorkflowResolver,
    private readonly whatsAppDirectOutboundBypass?: WhatsAppDirectOutboundBypassOptions,
    private readonly emailRoutingClassifier?: EmailRoutingClassifierPort,
    private readonly emailRoutingEngine?: EmailRoutingEnginePort,
    private readonly campaignDeliveryReconciler?: CampaignDeliveryReconcilePort,
  ) {}

  async process(ctx: ServiceContext, request: InboundRouteRequestDto): Promise<InboundRouteResponseDto> {
    this.assertRoutePermission(ctx, request.companyId);

    const companyChannel = await this.resolveCompanyChannel(request.companyChannelId, request.companyId);
    const adapter = this.adapterRegistry.require(request.channelKey);
    const idempotencyKey = request.idempotencyKey ?? randomUUID();
    const interactiveReplyId = extractInteractiveReplyIdFromPayload(request.payload);
    const interactiveReplyContextId = extractInteractiveReplyContextIdFromPayload(request.payload);

    // Campaign quoted-reply attribution (company_id + context.id → provider_message_id).
    // Free-text without context.id is intentionally ignored.
    if (this.campaignDeliveryReconciler && interactiveReplyContextId) {
      try {
        await this.campaignDeliveryReconciler.reconcileQuotedReply({
          companyId: request.companyId,
          contextMessageId: interactiveReplyContextId,
        });
      } catch {
        // Non-fatal — inbound conversation path continues.
      }
    }

    const duplicate = await this.inboundRepository.findByIdempotencyKey(
      request.companyChannelId,
      idempotencyKey,
    );
    // Meta often retries while the first attempt is still running. Re-running the
    // pipeline produces duplicate WhatsApp replies for the same customer message.
    if (duplicate && shouldSkipDuplicateInbound(duplicate)) {
      return {
        inboundEventId: duplicate.id,
        conversationId: duplicate.conversation_id ?? request.conversationId ?? "",
        channelSessionId: duplicate.channel_session_id ?? "",
        incomingMessageId: duplicate.incoming_message_id ?? "",
        runtimeExecutionId: duplicate.runtime_execution_id ?? undefined,
        duplicate: true,
      };
    }

    // Meta can deliver the same list/button tap twice with different wamids.
    // Claim after wamid idempotency so failed same-wamid retries can still proceed.
    // Scope claims by context message id so the same doctor/service id on a later
    // list (e.g. pricing after booking) is not treated as a duplicate tap.
    if (interactiveReplyId && !duplicate) {
      const claimed = claimInteractiveReplyDedupe({
        companyChannelId: request.companyChannelId,
        externalThreadId: request.externalThreadId,
        replyId: interactiveReplyId,
        contextMessageId: interactiveReplyContextId,
      });

      const recentInteractive = this.inboundRepository.findRecentInteractiveReply
        ? await this.inboundRepository.findRecentInteractiveReply({
            companyChannelId: request.companyChannelId,
            externalThreadId: request.externalThreadId,
            replyId: interactiveReplyId,
            contextMessageId: interactiveReplyContextId,
            withinMs: INTERACTIVE_REPLY_DEDUPE_TTL_MS,
            excludeIdempotencyKey: idempotencyKey,
          })
        : null;

      if (!claimed || (recentInteractive && shouldSkipDuplicateInbound(recentInteractive))) {
        // If the first delivery left automation still waiting on this list (e.g. race
        // rolled the run back onto the list node), allow a re-tap / second wamid through.
        let allowWaitingRetry = false;
        if (
          claimed &&
          recentInteractive?.processing_status === "processed" &&
          this.workflowResolver &&
          this.ports.automation?.hasWaitingRun
        ) {
          try {
            const resolution = await this.workflowResolver.resolveDetail(request.companyChannelId);
            if (resolution.status === "resolved") {
              allowWaitingRetry = await this.ports.automation.hasWaitingRun({
                companyId: request.companyId,
                flowId: resolution.workflow.automationFlowId,
                channelKey: request.channelKey,
                externalUserId: request.senderExternalId ?? request.externalThreadId,
              });
            }
          } catch {
            allowWaitingRetry = false;
          }
        }

        if (allowWaitingRetry) {
          request.trace?.step("webhook.interactive_reply_dedupe_bypassed", {
            replyId: interactiveReplyId,
            contextMessageId: interactiveReplyContextId,
            priorInboundEventId: recentInteractive?.id ?? null,
            reason: "automation_still_waiting",
          });
        } else {
          const prior = recentInteractive;
          request.trace?.step("webhook.interactive_reply_deduped", {
            replyId: interactiveReplyId,
            contextMessageId: interactiveReplyContextId,
            priorInboundEventId: prior?.id ?? null,
            reason: !claimed ? "in_memory_claim" : "recent_inbound_event",
          });
          return {
            inboundEventId: prior?.id ?? `deduped:${idempotencyKey}`,
            conversationId: prior?.conversation_id ?? request.conversationId ?? "",
            channelSessionId: prior?.channel_session_id ?? "",
            incomingMessageId: prior?.incoming_message_id ?? "",
            runtimeExecutionId: prior?.runtime_execution_id ?? undefined,
            duplicate: true,
          };
        }
      }
    }

    const inboundEvent = duplicate
      ? duplicate
      : await waPerfMeasure("Database writes: create inbound event", () =>
          this.inboundRepository.createEvent({
            companyId: request.companyId,
            companyChannelId: request.companyChannelId,
            channelKey: request.channelKey,
            idempotencyKey,
            externalThreadId: request.externalThreadId,
            externalMessageId: request.externalMessageId,
            senderExternalId: request.senderExternalId,
            payload: request.payload,
          }),
        );

    request.trace?.step("webhook.inbound_event_created", {
      inboundEventId: inboundEvent.id,
      duplicate: Boolean(duplicate),
    });

    await waPerfMeasure("Database writes: mark inbound processing", () =>
      this.inboundRepository.updateEvent({
        inboundEventId: inboundEvent.id,
        processingStatus: "processing",
      }),
    );

    const pipelineStartedAt = Date.now();
    try {
      const normalized = adapter.normalizeInbound({ companyChannel }, request.payload);

      if (request.channelKey === "whatsapp") {
        logWhatsApp("Parsed message", {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          phoneNumber: normalized.senderExternalId,
          externalThreadId: normalized.externalThreadId,
          externalMessageId: normalized.externalMessageId,
          textPreview: String(normalized.text ?? "").slice(0, 160),
          messageType: normalized.metadata?.messageType ?? null,
        });
        logWhatsApp("Company resolved", {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          phoneNumber: normalized.senderExternalId,
        });
      }

      const validationBefore = buildPipelineValidationBeforePayload({
        channelKey: request.channelKey,
        normalized,
      });
      logPipelineValidation("pipeline.validation.before", validationBefore);
      request.trace?.step("webhook.diag", {
        pipelineValidationImpl: PIPELINE_VALIDATION_IMPL,
        pipelineValidationEvent: "pipeline.validation.before",
        ...validationBefore,
      });

      if (!hasValidInboundContent(normalized)) {
        logPipelineValidation("pipeline.validation.failed", {
          channelKey: request.channelKey,
          normalized: validationBefore.normalized,
          throws: "ValidationError",
          message: "Inbound message must include text, media, or an interactive reply.",
          sourceLocation: "inbound-message-pipeline.ts:hasValidInboundContent-check",
        });
        throw new ValidationError("Inbound message must include text, media, or an interactive reply.");
      }

      logPipelineValidation("pipeline.validation.after", {
        channelKey: request.channelKey,
        externalMessageId: normalized.externalMessageId,
      });
      request.trace?.step("webhook.diag", {
        pipelineValidationImpl: PIPELINE_VALIDATION_IMPL,
        pipelineValidationEvent: "pipeline.validation.after",
        channelKey: request.channelKey,
        externalMessageId: normalized.externalMessageId,
      });

      const inboundText = resolveInboundMessageText(normalized);

      request.trace?.step("webhook.message_normalized", {
        externalThreadId: normalized.externalThreadId,
        externalMessageId: normalized.externalMessageId,
        senderExternalId: normalized.senderExternalId,
        textLength: inboundText.length,
        interactiveReply: Boolean(normalized.metadata?.kind === "interactive_reply"),
      });

      // Sprint 3–6: AI Email Routing (email only) — gated by commercial entitlement/quota.
      let emailRoutingClassification: EmailRoutingClassificationRuntime | undefined;
      let emailRoutingDecision: EmailRoutingDecisionRuntime | undefined;
      let emailRoutingTicket: EmailRoutingTicketActionRuntimeResult | undefined;
      if (request.channelKey === "email" && this.emailRoutingClassifier) {
        let aiEmailRoutingAllowed = true;
        if (this.ports.aiEmailRoutingCommercial) {
          try {
            const access = await this.ports.aiEmailRoutingCommercial.checkAccess({
              companyId: request.companyId,
            });
            aiEmailRoutingAllowed = access.allowed;
            request.trace?.step("webhook.email_routing_commercial", {
              inboundEventId: inboundEvent.id,
              companyId: request.companyId,
              allowed: access.allowed,
              reason: access.reason,
            });
          } catch {
            // Fail closed on unexpected commercial-port errors.
            aiEmailRoutingAllowed = false;
            request.trace?.step("webhook.email_routing_commercial", {
              inboundEventId: inboundEvent.id,
              companyId: request.companyId,
              allowed: false,
              reason: "entitlement_error",
            });
          }
        }

        if (aiEmailRoutingAllowed) {
          emailRoutingClassification = await this.classifyInboundEmailRouting({
            companyId: request.companyId,
            subject:
              typeof normalized.metadata?.subject === "string" ? normalized.metadata.subject : null,
            body: inboundText,
            inboundEventId: inboundEvent.id,
            trace: request.trace,
          });
          if (emailRoutingClassification) {
            if (this.emailRoutingEngine) {
              emailRoutingDecision = await this.decideInboundEmailRouting({
                companyId: request.companyId,
                classification: emailRoutingClassification,
                inboundEventId: inboundEvent.id,
                trace: request.trace,
              });
            }
            normalized.metadata = {
              ...(normalized.metadata ?? {}),
              emailRoutingClassification,
              ...(emailRoutingDecision ? { emailRoutingDecision } : {}),
            };

            if (this.ports.aiEmailRoutingCommercial) {
              try {
                await this.ports.aiEmailRoutingCommercial.recordUsage({
                  companyId: request.companyId,
                  inboundEventId: inboundEvent.id,
                  category: emailRoutingClassification.category,
                  source: emailRoutingClassification.source,
                });
              } catch {
                // Metering failure must not break inbound email or AI routing results.
                request.trace?.step("webhook.email_routing_usage", {
                  inboundEventId: inboundEvent.id,
                  companyId: request.companyId,
                  recorded: false,
                  reason: "usage_record_failed",
                });
              }
            }
          }
        }
      }

      traceParsedInboundMessage({
        channelKey: request.channelKey,
        externalUserId: normalized.senderExternalId ?? normalized.externalThreadId,
        text: inboundText,
        metadata: normalized.metadata ?? {},
      });

      const workflowResolution = this.workflowResolver
        ? await waPerfMeasure("Workflow lookup", () =>
            this.workflowResolver!.resolveDetail(request.companyChannelId),
          )
        : (() => {
            waPerfNoteSkipped("Workflow lookup", "no_workflow_resolver");
            const fallback: ChannelWorkflowResolution = {
              status: "skipped",
              reason: "no_binding",
            };
            return fallback;
          })();

      const disabledBoundFlowId =
        workflowResolution.status === "skipped" &&
        workflowResolution.reason === "binding_disabled" &&
        typeof workflowResolution.automationFlowId === "string"
          ? workflowResolution.automationFlowId
          : null;

      const existingSession = await this.sessionRepository.findByExternalThread(
        request.companyChannelId,
        normalized.externalThreadId,
      );
      const stickyConversationId = request.conversationId ?? existingSession?.conversation_id ?? null;
      let stickyMetadata =
        stickyConversationId && this.ports.conversation.getConversationMetadata
          ? await this.ports.conversation.getConversationMetadata(stickyConversationId)
          : null;
      let stickyTransfer = readActiveWorkflowTransfer(stickyMetadata);
      // Channel binding disabled: do not keep routing into the same automation flow via sticky handoff.
      if (disabledBoundFlowId && stickyTransfer?.flowId === disabledBoundFlowId) {
        if (
          stickyConversationId &&
          this.ports.conversation.updateConversationMetadata &&
          this.ports.conversation.getConversationMetadata
        ) {
          const currentMeta =
            (await this.ports.conversation.getConversationMetadata(stickyConversationId)) ??
            stickyMetadata ??
            {};
          stickyMetadata = {
            ...currentMeta,
            inboundWorkflowTransfer: buildClearedWorkflowTransfer(
              currentMeta.inboundWorkflowTransfer,
              "channel_binding_disabled",
            ),
          };
          await this.ports.conversation.updateConversationMetadata({
            conversationId: stickyConversationId,
            metadata: stickyMetadata,
          });
        }
        request.trace?.step("webhook.sticky_workflow_cleared", {
          flowId: stickyTransfer.flowId,
          reason: "channel_binding_disabled",
        });
        stickyTransfer = null;
      }
      const bindingWorkflow =
        workflowResolution.status === "resolved" ? workflowResolution.workflow : null;

      // Sticky AI→workflow handoff must not restart a finished flow. If nothing is waiting,
      // clear the sticky flag and fall back to the AI employee.
      if (
        stickyTransfer &&
        !bindingWorkflow &&
        this.ports.automation?.hasWaitingRun &&
        stickyConversationId
      ) {
        const canResumeSticky = await this.ports.automation.hasWaitingRun({
          companyId: request.companyId,
          flowId: stickyTransfer.flowId,
          channelKey: request.channelKey,
          externalUserId: normalized.senderExternalId ?? normalized.externalThreadId,
        });
        if (!canResumeSticky) {
          if (
            this.ports.conversation.updateConversationMetadata &&
            this.ports.conversation.getConversationMetadata
          ) {
            const currentMeta =
              (await this.ports.conversation.getConversationMetadata(stickyConversationId)) ??
              stickyMetadata ??
              {};
            stickyMetadata = {
              ...currentMeta,
              inboundWorkflowTransfer: buildClearedWorkflowTransfer(
                currentMeta.inboundWorkflowTransfer,
                "stale_sticky_no_waiting_run",
              ),
            };
            await this.ports.conversation.updateConversationMetadata({
              conversationId: stickyConversationId,
              metadata: stickyMetadata,
            });
          }
          request.trace?.step("webhook.sticky_workflow_cleared", {
            flowId: stickyTransfer.flowId,
            reason: "stale_sticky_no_waiting_run",
          });
          stickyTransfer = null;
        }
      }

      let aiEmployeeId = request.aiEmployeeId;
      let sessionTimeoutMinutes: number | undefined;
      let employeeConversationMetadata = request.employeeConversationMetadata;
      let transferSource: "channel_binding" | "ai_employee_sticky" | "ai_employee_intent" | null =
        bindingWorkflow ? "channel_binding" : stickyTransfer ? "ai_employee_sticky" : null;

      // Email AI Employee: fail-closed commercial entitlement + quota (ai_employee). Separate from Email Routing.
      let emailAiEmployeeAllowed = true;
      let emailAiEmployeeBlockReason: string | undefined;
      if (request.channelKey === "email" && request.executeAi && this.ports.aiEmployeeEmailCommercial) {
        try {
          const access = await this.ports.aiEmployeeEmailCommercial.checkAccess({
            companyId: request.companyId,
          });
          emailAiEmployeeAllowed = access.allowed;
          if (!access.allowed) {
            emailAiEmployeeBlockReason = access.reason;
          }
          request.trace?.step("webhook.ai_employee_email_commercial", {
            inboundEventId: inboundEvent.id,
            companyId: request.companyId,
            allowed: access.allowed,
            reason: access.reason,
          });
        } catch {
          emailAiEmployeeAllowed = false;
          emailAiEmployeeBlockReason = "entitlement_error";
          request.trace?.step("webhook.ai_employee_email_commercial", {
            inboundEventId: inboundEvent.id,
            companyId: request.companyId,
            allowed: false,
            reason: "entitlement_error",
          });
        }
      }

      // Resolve AI employee while channel workflow is off so we can force-transfer booking intents.
      if (
        request.executeAi &&
        !bindingWorkflow &&
        !stickyTransfer &&
        !aiEmployeeId &&
        this.ports.employeeRuntime &&
        (request.channelKey !== "email" || emailAiEmployeeAllowed)
      ) {
        const resolvedEmployee = await this.ports.employeeRuntime.resolveForInboundChannel({
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
        });
        if (resolvedEmployee) {
          aiEmployeeId = resolvedEmployee.aiEmployeeId;
          sessionTimeoutMinutes = resolvedEmployee.sessionTimeoutMinutes;
          employeeConversationMetadata = resolvedEmployee.conversationMetadataSeed;
          request.trace?.step("webhook.ai_employee_resolved", {
            aiEmployeeId,
            companyChannelId: request.companyChannelId,
            channelKey: request.channelKey,
          });
          if (request.channelKey === "whatsapp") {
            logWhatsApp("AI Employee selected", {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              aiEmployeeId,
              phoneNumber: normalized.senderExternalId,
            });
          }
        } else if (request.channelKey === "whatsapp") {
          logWhatsApp("AI Employee selected", {
            companyId: request.companyId,
            companyChannelId: request.companyChannelId,
            aiEmployeeId: null,
            phoneNumber: normalized.senderExternalId,
            note: "no_employee_resolved",
          });
        }
      }

      const intentTransferFlowId =
        !bindingWorkflow &&
        !stickyTransfer &&
        !disabledBoundFlowId &&
        this.ports.automation &&
        isBookingTransferIntent(inboundText)
          ? readTransferableFlowId(employeeConversationMetadata) ??
            readTransferableFlowId(stickyMetadata)
          : null;

      if (intentTransferFlowId) {
        transferSource = "ai_employee_intent";
      } else if (
        !bindingWorkflow &&
        !stickyTransfer &&
        isBookingTransferIntent(inboundText) &&
        request.channelKey === "whatsapp"
      ) {
        logWhatsApp("Booking intent without transferable flow", {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          aiEmployeeId: aiEmployeeId ?? null,
          phoneNumber: normalized.senderExternalId,
          note: "configure_transferableFlowId_on_employee_channels_tab",
        });
        request.trace?.step("webhook.booking_intent_no_transfer_flow", {
          aiEmployeeId: aiEmployeeId ?? null,
          hasEmployeeMetadata: Boolean(employeeConversationMetadata),
        });
      }

      const resolvedWorkflow =
        bindingWorkflow ??
        (stickyTransfer && this.ports.automation
          ? {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              automationFlowId: stickyTransfer.flowId,
              executionMetadata: undefined,
            }
          : null) ??
        (intentTransferFlowId
          ? {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              automationFlowId: intentTransferFlowId,
              executionMetadata: undefined,
            }
          : null);
      const useWorkflow = Boolean(resolvedWorkflow && this.ports.automation);

      request.trace?.step(
        useWorkflow ? "webhook.workflow_resolved" : "webhook.workflow_missing",
        useWorkflow && resolvedWorkflow
          ? {
              automationFlowId: resolvedWorkflow.automationFlowId,
              ...(transferSource && transferSource !== "channel_binding"
                ? { transferSource }
                : {}),
            }
          : {
              companyChannelId: request.companyChannelId,
              skipReason: workflowResolution.status === "skipped" ? workflowResolution.reason : "no_binding",
              ...(workflowResolution.status === "skipped" && workflowResolution.automationFlowId
                ? { automationFlowId: workflowResolution.automationFlowId }
                : {}),
            },
      );

      if (request.channelKey === "whatsapp" && request.executeAi && !useWorkflow) {
        logWhatsApp("AI Employee selected", {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          aiEmployeeId: aiEmployeeId ?? null,
          phoneNumber: normalized.senderExternalId,
          note: aiEmployeeId ? "preselected_or_resolved" : "skipped_resolution",
        });
      }

      if (request.channelKey === "email" && request.executeAi && !emailAiEmployeeAllowed) {
        aiEmployeeId = undefined;
        employeeConversationMetadata = undefined;
        request.trace?.step("webhook.ai_employee_email_skipped", {
          inboundEventId: inboundEvent.id,
          reason: emailAiEmployeeBlockReason ?? "not_entitled",
        });
      }

      let legacyAssistantId = request.aiAssistantId;
      if (request.executeAi && !useWorkflow && !legacyAssistantId) {
        // Email AI Employee path does not fall back to legacy assistant when entitlement denied.
        if (request.channelKey !== "email" || emailAiEmployeeAllowed) {
          legacyAssistantId =
            (await this.ports.conversation.resolveCompanyAssistantId?.(request.companyId)) ?? undefined;
        }
      }

      if (request.executeAi && !useWorkflow && !aiEmployeeId && !legacyAssistantId) {
        if (request.channelKey === "email") {
          request.trace?.step("webhook.ai_employee_email_skipped", {
            inboundEventId: inboundEvent.id,
            reason: emailAiEmployeeAllowed ? "no_employee" : "not_entitled",
          });
          // Continue inbound ingestion without AI reply (do not throw).
        } else {
          throw new ValidationError(
            "A published AI Employee or legacy assistant is required when executeAi is true.",
          );
        }
      }

      let session = await waPerfMeasure("Conversation lookup", () =>
        this.sessionEngine.resolveSession(ctx, {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
          externalThreadId: normalized.externalThreadId,
          senderExternalId: normalized.senderExternalId,
          conversationId: request.conversationId,
          aiAssistantId: legacyAssistantId,
          requireAiAssistant:
            !useWorkflow &&
            (request.channelKey !== "email" || Boolean(aiEmployeeId || legacyAssistantId)),
          employeeConversationMetadata,
          metadata: normalized.metadata,
        }),
      );

      let aiEmployeeEngagement: AiEmployeeEngagementState | null = null;

      if (request.channelKey === "whatsapp" && aiEmployeeId) {
        const effectiveSessionTimeoutMinutes =
          sessionTimeoutMinutes ??
          (this.ports.employeeRuntime?.resolveSessionTimeoutMinutes
            ? await this.ports.employeeRuntime.resolveSessionTimeoutMinutes({
                companyId: request.companyId,
                aiEmployeeId,
              })
            : null) ??
          DEFAULT_AI_EMPLOYEE_SESSION_TIMEOUT_MINUTES;

        const engagementResolution = resolveAiEmployeeEngagement({
          previousLastInboundAt: session.last_inbound_at,
          now: new Date(),
          sessionTimeoutMinutes: effectiveSessionTimeoutMinutes,
          aiEmployeeId,
          previousEngagement: readAiEmployeeEngagement(session.metadata),
        });
        aiEmployeeEngagement = engagementResolution.engagement;

        session = await waPerfMeasure("Database writes: update engagement session metadata", () =>
          this.sessionRepository.updateSessionMetadata(
            session.id,
            buildEngagementMetadataPatch(engagementResolution.engagement),
          ),
        );

        if (engagementResolution.isNewEngagement) {
          request.trace?.step("webhook.ai_employee_engagement_started", {
            channelSessionId: session.id,
            conversationId: session.conversation_id,
            aiEmployeeId,
            engagementStartedAt: engagementResolution.engagement.startedAt,
            sessionTimeoutMinutes: effectiveSessionTimeoutMinutes,
          });
          if (request.channelKey === "whatsapp") {
            logWhatsApp("AI Employee engagement started", {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              channelSessionId: session.id,
              aiEmployeeId,
              engagementStartedAt: engagementResolution.engagement.startedAt,
              sessionTimeoutMinutes: effectiveSessionTimeoutMinutes,
            });
          }
        }
      }

      waTraceBindInboundExternalMessageId(normalized.externalMessageId);
      waTraceBindConversation(session.conversation_id);
      waTraceBindSession(session.id);
      if (resolvedWorkflow) {
        waTraceBindWorkflow(
          resolvedWorkflow.executionMetadata?.workflowId ?? resolvedWorkflow.automationFlowId,
        );
      }

      await waPerfMeasure("Database writes: touch inbound session", () =>
        this.sessionRepository.touchInbound(session.id),
      );

      if (
        intentTransferFlowId &&
        transferSource === "ai_employee_intent" &&
        this.ports.conversation.updateConversationMetadata &&
        this.ports.conversation.getConversationMetadata
      ) {
        const currentMeta =
          (await this.ports.conversation.getConversationMetadata(session.conversation_id)) ?? {};
        await this.ports.conversation.updateConversationMetadata({
          conversationId: session.conversation_id,
          metadata: {
            ...currentMeta,
            transferableFlowId: intentTransferFlowId,
            inboundWorkflowTransfer: {
              active: true,
              flowId: intentTransferFlowId,
              transferredAt: new Date().toISOString(),
              transferredByEmployeeId: aiEmployeeId ?? null,
              reason: "booking_intent_auto_transfer",
            },
          },
        });
        request.trace?.step("webhook.ai_employee_intent_transfer", {
          flowId: intentTransferFlowId,
          conversationId: session.conversation_id,
        });
      }

      request.trace?.step("webhook.session_resolved", {
        channelSessionId: session.id,
        conversationId: session.conversation_id,
        requireAiAssistant: !useWorkflow,
      });
      if (request.channelKey === "whatsapp") {
        logWhatsApp("Conversation resolved", {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          phoneNumber: normalized.senderExternalId,
          aiEmployeeId: aiEmployeeId ?? null,
        });
      }

      // Phase 2 — bind trusted CRM identity from WhatsApp sender before AI prepare/execute.
      const trustedChannelIdentity = await this.resolveAndBindTrustedChannelCustomer({
        companyId: request.companyId,
        channelKey: request.channelKey,
        conversationId: session.conversation_id,
        senderExternalId: normalized.senderExternalId,
        trace: request.trace,
      });

      if (
        (emailRoutingClassification || emailRoutingDecision) &&
        this.ports.conversation.updateConversationMetadata &&
        this.ports.conversation.getConversationMetadata
      ) {
        const currentMeta =
          (await this.ports.conversation.getConversationMetadata(session.conversation_id)) ?? {};
        await this.ports.conversation.updateConversationMetadata({
          conversationId: session.conversation_id,
          metadata: {
            ...currentMeta,
            ...(emailRoutingClassification ? { emailRoutingClassification } : {}),
            ...(emailRoutingDecision ? { emailRoutingDecision } : {}),
          },
        });
      }

      if (
        request.channelKey === "email" &&
        emailRoutingClassification &&
        emailRoutingDecision &&
        this.ports.emailRoutingTickets
      ) {
        try {
          emailRoutingTicket = await this.ports.emailRoutingTickets.apply({
            companyId: request.companyId,
            conversationId: session.conversation_id,
            inboundEventId: inboundEvent.id,
            subject:
              typeof normalized.metadata?.subject === "string" ? normalized.metadata.subject : null,
            bodyPreview: inboundText.slice(0, 500),
            classification: emailRoutingClassification,
            decision: emailRoutingDecision,
          });
          request.trace?.step("webhook.email_routing_ticket", {
            inboundEventId: inboundEvent.id,
            companyId: request.companyId,
            status: emailRoutingTicket.status,
            ticketId: emailRoutingTicket.ticketId,
            assignedUserId: emailRoutingTicket.assignedUserId,
            targetType: emailRoutingTicket.targetType ?? null,
            success: emailRoutingTicket.status !== "failed",
          });
          if (
            this.ports.conversation.updateConversationMetadata &&
            this.ports.conversation.getConversationMetadata
          ) {
            const currentMeta =
              (await this.ports.conversation.getConversationMetadata(session.conversation_id)) ?? {};
            await this.ports.conversation.updateConversationMetadata({
              conversationId: session.conversation_id,
              metadata: {
                ...currentMeta,
                emailRoutingTicket,
              },
            });
          }
          normalized.metadata = {
            ...(normalized.metadata ?? {}),
            emailRoutingTicket,
          };
        } catch (error) {
          const reason =
            error instanceof Error ? error.message.slice(0, 120) : "email_routing_ticket_failed";
          emailRoutingTicket = {
            status: "failed",
            reason,
            ticketId: null,
            assignedUserId: null,
          };
          request.trace?.step("webhook.email_routing_ticket", {
            inboundEventId: inboundEvent.id,
            companyId: request.companyId,
            status: "failed",
            ticketId: null,
            assignedUserId: null,
            success: false,
          });
          // Do not fail inbound email ingestion because ticket apply failed.
        }
      }

      let incomingMessageId: string | undefined = inboundEvent.incoming_message_id ?? undefined;
      incomingMessageId = await this.resolveInboundIncomingMessageId({
        inboundEvent,
        conversationId: session.conversation_id,
        externalMessageId: normalized.externalMessageId,
        request,
        normalized,
        inboundText,
        useWorkflow,
        incomingMessageId,
      });

      if (shouldSkipInboundRuntimeRetry(inboundEvent)) {
        request.trace?.step("webhook.inbound_runtime_retry_skipped", {
          inboundEventId: inboundEvent.id,
          runtimeExecutionId: inboundEvent.runtime_execution_id,
          incomingMessageId: incomingMessageId ?? null,
        });
        if (incomingMessageId && !inboundEvent.incoming_message_id) {
          await this.inboundRepository.updateEvent({
            inboundEventId: inboundEvent.id,
            processingStatus: "processed",
            conversationId: session.conversation_id,
            channelSessionId: session.id,
            incomingMessageId,
            runtimeExecutionId: inboundEvent.runtime_execution_id ?? undefined,
            processedAt: new Date().toISOString(),
          });
        }
        return {
          inboundEventId: inboundEvent.id,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId: incomingMessageId ?? "",
          runtimeExecutionId: inboundEvent.runtime_execution_id ?? undefined,
          duplicate: true,
          emailRoutingClassification,
          emailRoutingDecision,
          emailRoutingTicket,
        };
      }

      // Always persist inbound before welcome/AI so Web Chat, last_message_at, and unread
      // stay in sync even when AI is skipped or runtime fails later. Idempotent by
      // externalMessageId / correlationId.
      if (!incomingMessageId) {
        const incomingMessage = await waPerfMeasure("Database writes: add incoming message", () =>
          this.ports.conversation.addIncomingMessage({
            conversationId: session.conversation_id,
            content: inboundText,
            externalMessageId: normalized.externalMessageId,
            metadata: buildInboundIncomingMetadata(inboundEvent.id, request, normalized),
          }),
        );
        incomingMessageId = incomingMessage.id;
        if (incomingMessage.reused) {
          request.trace?.step("webhook.inbound_message_reused", {
            incomingMessageId,
            externalMessageId: normalized.externalMessageId,
            source: "conversation_port",
          });
        }
        if (!inboundEvent.incoming_message_id) {
          await this.inboundRepository.updateEvent({
            inboundEventId: inboundEvent.id,
            processingStatus: "processing",
            incomingMessageId,
          });
        }
      } else if (incomingMessageId) {
        request.trace?.step("webhook.inbound_message_reused", {
          incomingMessageId,
          inboundEventId: inboundEvent.id,
          source: inboundEvent.incoming_message_id ? "inbound_event" : "lookup",
        });
        if (!inboundEvent.incoming_message_id) {
          await this.inboundRepository.updateEvent({
            inboundEventId: inboundEvent.id,
            processingStatus: "processing",
            incomingMessageId,
          });
        }
      }

      if (
        this.whatsAppDirectOutboundBypass?.enabled &&
        isWhatsAppDirectOutboundBypassAllowed() &&
        request.channelKey === "whatsapp" &&
        this.whatsAppDirectOutboundBypass.credentialsLoader
      ) {
        request.trace?.step("webhook.diag", {
          stage: "whatsapp.direct_outbound_bypass.start",
          payload: WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
          note: "Automation/workflow outbound bypassed — sending via WhatsAppApiClient.sendMessage()",
        });

        const graphApiResponseBody = await sendWhatsAppDirectOutboundBypass({
          companyId: request.companyId,
          companyChannelConfiguration: companyChannel.configuration,
          credentialsLoader: this.whatsAppDirectOutboundBypass.credentialsLoader,
        });

        this.whatsAppDirectOutboundBypass.onResponse?.({
          graphApiResponseBody,
          payload: WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD,
        });

        request.trace?.step("webhook.diag", {
          stage: "whatsapp.direct_outbound_bypass.response",
          graphApiResponseBody,
        });

        await this.inboundRepository.updateEvent({
          inboundEventId: inboundEvent.id,
          processingStatus: "processed",
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId,
          processedAt: new Date().toISOString(),
        });

        return {
          inboundEventId: inboundEvent.id,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId: incomingMessageId ?? "",
          responseContent:
            WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD.type === "text"
              ? WHATSAPP_DIRECT_OUTBOUND_BYPASS_PAYLOAD.text.body
              : undefined,
          emailRoutingClassification,
          emailRoutingDecision,
          emailRoutingTicket,
        };
      }

      let runtimeExecutionId: string | undefined;
      let automationRunId: string | undefined;
      let outboundDeliveryId: string | undefined;
      let outboundDeliveryIds: string[] | undefined;
      let responseContent: string | undefined;

      // Human Handoff: after inbound is persisted, skip AI + sticky automation when
      // ownership is human/queue/paused (or conversation is transferred/assigned).
      const automationGate = await this.resolveInboundAutomationGate({
        companyId: request.companyId,
        conversationId: session.conversation_id,
        request,
      });
      request.trace?.step("webhook.inbound_automation_gate", {
        conversationId: session.conversation_id,
        allowAutomatedReply: automationGate.allowAutomatedReply,
        reason: automationGate.reason,
        source: automationGate.source,
      });

      if (!automationGate.allowAutomatedReply) {
        await this.inboundRepository.updateEvent({
          inboundEventId: inboundEvent.id,
          processingStatus: "processed",
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId,
          processedAt: new Date().toISOString(),
        });

        request.trace?.step("webhook.inbound_automation_skipped", {
          conversationId: session.conversation_id,
          reason: automationGate.reason,
          source: automationGate.source,
          executeAiRequested: Boolean(request.executeAi),
          useWorkflow,
        });

        if (request.channelKey === "whatsapp") {
          logWhatsApp("Inbound automation skipped (human handoff gate)", {
            companyId: request.companyId,
            companyChannelId: request.companyChannelId,
            conversationId: session.conversation_id,
            reason: automationGate.reason,
            source: automationGate.source,
          });
          waPerfNoteSkipped("inbound_automation_gate", automationGate.reason);
        }

        return {
          inboundEventId: inboundEvent.id,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId: incomingMessageId ?? "",
          responseContent: undefined,
          emailRoutingClassification,
          emailRoutingDecision,
          emailRoutingTicket,
        };
      }

      if (useWorkflow && resolvedWorkflow && this.ports.automation) {
        const automation = this.ports.automation;
        request.trace?.step("webhook.automation_started", {
          flowId: resolvedWorkflow.automationFlowId,
        });

        waPerfMarkInboundExecution("workflow");
        const automationResult = await waPerfMeasure("Workflow resume", () =>
          automation.startWorkflow({
            companyId: request.companyId,
            flowId: resolvedWorkflow.automationFlowId,
            channelKey: request.channelKey,
            externalUserId: normalized.senderExternalId ?? normalized.externalThreadId,
            messageText: inboundText,
            externalMessageId: normalized.externalMessageId,
            initialVariables: {
              lastMessage: inboundText,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              channelSessionId: session.id,
            },
            metadata: {
              inboundEventId: inboundEvent.id,
              companyChannelId: request.companyChannelId,
              requestId: request.requestId ?? null,
              ...(normalized.metadata ?? {}),
            },
          }),
        );

        automationRunId = automationResult.runId;
        waTraceBindAutomationRun(automationRunId);
        responseContent = automationResult.responseContent;
        const outboundMessages = automationResult.outboundMessages ?? [];
        const workflowLifecycle = automationResult.lifecycle ?? null;

        request.trace?.step("webhook.automation_completed", {
          automationRunId,
          outboundMessageCount: outboundMessages.length,
          hasResponseContent: Boolean(responseContent?.trim()),
          lifecycle: workflowLifecycle,
        });

        if (
          workflowLifecycle &&
          TERMINAL_WORKFLOW_LIFECYCLES.has(workflowLifecycle) &&
          transferSource &&
          transferSource !== "channel_binding" &&
          this.ports.conversation.updateConversationMetadata &&
          this.ports.conversation.getConversationMetadata
        ) {
          const currentMeta =
            (await this.ports.conversation.getConversationMetadata(session.conversation_id)) ?? {};
          await this.ports.conversation.updateConversationMetadata({
            conversationId: session.conversation_id,
            metadata: {
              ...currentMeta,
              inboundWorkflowTransfer: buildClearedWorkflowTransfer(
                currentMeta.inboundWorkflowTransfer,
                `workflow_${workflowLifecycle}`,
              ),
            },
          });
          request.trace?.step("webhook.sticky_workflow_cleared", {
            flowId: resolvedWorkflow.automationFlowId,
            reason: `workflow_${workflowLifecycle}`,
            automationRunId,
          });
        }

        if (outboundMessages.length > 0) {
          try {
            const dispatched = await dispatchAutomationOutboundMessages(
              ctx,
              this.dispatcher,
              this.ports.conversation,
              {
                companyId: request.companyId,
                companyChannelId: request.companyChannelId,
                channelKey: request.channelKey,
                conversationId: session.conversation_id,
                channelSessionId: session.id,
                externalThreadId: normalized.externalThreadId,
                automationRunId,
                correlationId: inboundEvent.id,
                messages: outboundMessages,
              },
            );
            outboundDeliveryIds = dispatched.deliveryEventIds;
            outboundDeliveryId = dispatched.lastDeliveryEventId;
            responseContent = dispatched.responseContent ?? responseContent;
            request.trace?.step("webhook.outbound_dispatched", {
              outboundDeliveryId,
              outboundDeliveryIds,
              outboundMessageCount: outboundMessages.length,
            });
          } catch (error) {
            const outboundError =
              error instanceof Error ? error.message : "outbound_dispatch_failed";
            waTraceNoteError(outboundError);
            console.error("[WHATSAPP_OUTBOUND_TRACE] workflow outbound dispatch failed (message may already be in Omnichannel)", {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              automationRunId,
              channelKey: request.channelKey,
              error: outboundError,
            });
            request.trace?.step("webhook.outbound_failed", {
              automationRunId,
              error: outboundError,
            });
          }
        } else if (responseContent?.trim()) {
          try {
            const dispatched = await dispatchAutomationOutboundMessages(
              ctx,
              this.dispatcher,
              this.ports.conversation,
              {
                companyId: request.companyId,
                companyChannelId: request.companyChannelId,
                channelKey: request.channelKey,
                conversationId: session.conversation_id,
                channelSessionId: session.id,
                externalThreadId: normalized.externalThreadId,
                automationRunId,
                correlationId: inboundEvent.id,
                messages: [{ text: responseContent, payload: { kind: "automation_response" } }],
              },
            );
            outboundDeliveryId = dispatched.lastDeliveryEventId;
            outboundDeliveryIds = dispatched.deliveryEventIds;
            request.trace?.step("webhook.outbound_dispatched", { outboundDeliveryId });
          } catch (error) {
            const outboundError =
              error instanceof Error ? error.message : "outbound_dispatch_failed";
            waTraceNoteError(outboundError);
            console.error("[WHATSAPP_OUTBOUND_TRACE] workflow responseContent outbound failed (message may already be in Omnichannel)", {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              automationRunId,
              channelKey: request.channelKey,
              error: outboundError,
            });
            request.trace?.step("webhook.outbound_failed", {
              automationRunId,
              error: outboundError,
            });
          }
        }

        await this.inboundRepository.updateEvent({
          inboundEventId: inboundEvent.id,
          processingStatus: "processed",
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId,
          processedAt: new Date().toISOString(),
        });

        return {
          inboundEventId: inboundEvent.id,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId: incomingMessageId ?? "",
          automationRunId,
          outboundDeliveryId,
          outboundDeliveryIds,
          responseContent,
          emailRoutingClassification,
          emailRoutingDecision,
          emailRoutingTicket,
        };
      }

      if (
        !useWorkflow &&
        request.executeAi &&
        (request.channelKey !== "email" || Boolean(aiEmployeeId || legacyAssistantId))
      ) {
        let runtimeConfig = request.runtimeConfig;
        let suppressWelcomePrompt = false;
        let skipAiAfterDeterministicWelcome = false;
        let deterministicWelcomeText: string | null = null;

        try {
        if (aiEmployeeId && this.ports.employeeRuntime) {
          const conversationMetadata =
            (await this.ports.conversation.getConversationMetadata?.(session.conversation_id)) ??
            employeeConversationMetadata ??
            null;

          if (
            request.channelKey === "whatsapp" &&
            this.ports.employeeRuntime.resolveWhatsAppDeterministicWelcome
          ) {
            suppressWelcomePrompt = hasEngagementWelcomeDelivered(aiEmployeeEngagement);

            // Engagement already welcomed: greeting-only must not trigger a second AI greeting.
            if (
              hasEngagementWelcomeDelivered(aiEmployeeEngagement) &&
              isGreetingOnlyInboundText(inboundText)
            ) {
              skipAiAfterDeterministicWelcome = true;
            }

            if (
              shouldAttemptWhatsAppDeterministicWelcome({
                engagement: aiEmployeeEngagement,
              })
            ) {
              const resolvedWelcome =
                await this.ports.employeeRuntime.resolveWhatsAppDeterministicWelcome({
                  companyId: request.companyId,
                  aiEmployeeId,
                  trustedCustomerName: trustedChannelIdentity.trustedCustomerName,
                });

              if (resolvedWelcome?.welcomeText) {
                try {
                  await this.dispatcher.dispatch(ctx, {
                    companyId: request.companyId,
                    companyChannelId: request.companyChannelId,
                    channelKey: request.channelKey,
                    conversationId: session.conversation_id,
                    channelSessionId: session.id,
                    externalThreadId: normalized.externalThreadId,
                    text: resolvedWelcome.welcomeText,
                    metadata: {
                      deterministicWelcome: true,
                      aiEmployeeId,
                    },
                    persistConversationMessage: true,
                  });

                  const deliveredEngagement = markEngagementWelcomeDelivered(aiEmployeeEngagement!);
                  aiEmployeeEngagement = deliveredEngagement;
                  session = await this.sessionRepository.updateSessionMetadata(
                    session.id,
                    buildEngagementMetadataPatch(deliveredEngagement),
                  );
                  suppressWelcomePrompt = true;
                  deterministicWelcomeText = resolvedWelcome.welcomeText;
                  // Same-turn pure greetings are already answered by the configured welcome.
                  if (isGreetingOnlyInboundText(inboundText)) {
                    skipAiAfterDeterministicWelcome = true;
                  }

                  request.trace?.step("webhook.whatsapp_deterministic_welcome_sent", {
                    aiEmployeeId,
                    conversationId: session.conversation_id,
                    engagementStartedAt: deliveredEngagement.startedAt,
                    skipAiAfterGreeting: skipAiAfterDeterministicWelcome,
                  });
                  logWhatsApp("Deterministic welcome sent", {
                    companyId: request.companyId,
                    companyChannelId: request.companyChannelId,
                    conversationId: session.conversation_id,
                    aiEmployeeId,
                    phoneNumber: normalized.senderExternalId,
                    engagementStartedAt: deliveredEngagement.startedAt,
                    skipAiAfterGreeting: skipAiAfterDeterministicWelcome,
                  });
                } catch (error) {
                  const welcomeError =
                    error instanceof Error ? error.message : "welcome_outbound_dispatch_failed";
                  request.trace?.step("webhook.whatsapp_deterministic_welcome_failed", {
                    aiEmployeeId,
                    error: welcomeError,
                  });
                  logWhatsAppError("Deterministic welcome dispatch failed", error, {
                    companyId: request.companyId,
                    companyChannelId: request.companyChannelId,
                    conversationId: session.conversation_id,
                    aiEmployeeId,
                    phoneNumber: normalized.senderExternalId,
                  });
                  // Outbound persists the conversation message before Meta send. When Meta
                  // auth/delivery fails after persist, still stamp the engagement so we do
                  // not re-welcome every turn and do not stack a second AI greeting on
                  // greeting-only inbounds.
                  try {
                    const deliveredEngagement = markEngagementWelcomeDelivered(aiEmployeeEngagement!);
                    aiEmployeeEngagement = deliveredEngagement;
                    session = await this.sessionRepository.updateSessionMetadata(
                      session.id,
                      buildEngagementMetadataPatch(deliveredEngagement),
                    );
                    suppressWelcomePrompt = true;
                    deterministicWelcomeText = resolvedWelcome.welcomeText;
                    if (isGreetingOnlyInboundText(inboundText)) {
                      skipAiAfterDeterministicWelcome = true;
                    }
                    request.trace?.step("webhook.whatsapp_deterministic_welcome_stamped_after_dispatch_error", {
                      aiEmployeeId,
                      conversationId: session.conversation_id,
                      engagementStartedAt: deliveredEngagement.startedAt,
                      skipAiAfterGreeting: skipAiAfterDeterministicWelcome,
                      dispatchError: welcomeError,
                    });
                  } catch {
                    // Never fail the inbound turn because secondary welcome stamping threw.
                  }
                }
              }
            }
          }

          if (skipAiAfterDeterministicWelcome) {
            if (!incomingMessageId) {
              // Greeting-only / post-welcome skip never reaches runtime persistence — persist here
              // so the customer's first inbound appears in Web Chat.
              const existingId = await this.resolveInboundIncomingMessageId({
                inboundEvent,
                conversationId: session.conversation_id,
                externalMessageId: normalized.externalMessageId,
                request,
                normalized,
                inboundText,
                useWorkflow,
                incomingMessageId,
                lookupOnly: true,
              });
              if (existingId) {
                incomingMessageId = existingId;
              } else {
                const incomingMessage = await this.ports.conversation.addIncomingMessage({
                  conversationId: session.conversation_id,
                  content: inboundText,
                  externalMessageId: normalized.externalMessageId,
                  metadata: buildInboundIncomingMetadata(inboundEvent.id, request, normalized),
                });
                incomingMessageId = incomingMessage.id;
                if (incomingMessage.reused) {
                  request.trace?.step("webhook.inbound_message_reused", {
                    incomingMessageId,
                    externalMessageId: normalized.externalMessageId,
                    source: "conversation_port_welcome_skip",
                  });
                }
              }
            }

            await this.inboundRepository.updateEvent({
              inboundEventId: inboundEvent.id,
              processingStatus: "processed",
              conversationId: session.conversation_id,
              channelSessionId: session.id,
              incomingMessageId,
              processedAt: new Date().toISOString(),
            });

            request.trace?.step("webhook.whatsapp_deterministic_welcome_skip_ai", {
              aiEmployeeId,
              conversationId: session.conversation_id,
              reason: hasEngagementWelcomeDelivered(aiEmployeeEngagement)
                ? "greeting_only_after_welcome_already_delivered"
                : "greeting_only_after_deterministic_welcome",
            });

            return {
              inboundEventId: inboundEvent.id,
              conversationId: session.conversation_id,
              channelSessionId: session.id,
              incomingMessageId: incomingMessageId ?? "",
              responseContent: deterministicWelcomeText ?? undefined,
            };
          }

          const prepared = await this.ports.employeeRuntime.prepareForConversation({
            companyId: request.companyId,
            conversationId: session.conversation_id,
            aiEmployeeId,
            conversationMetadata,
            suppressWelcomePrompt,
            basePageContext: {
              module: "omnichannel",
              channelKey: request.channelKey,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              channelIdentityStatus: trustedChannelIdentity.status,
              ...(trustedChannelIdentity.customerId
                ? {
                    trustedCustomerId: trustedChannelIdentity.customerId,
                    ...(trustedChannelIdentity.trustedCustomerName
                      ? { trustedCustomerName: trustedChannelIdentity.trustedCustomerName }
                      : {}),
                  }
                : {}),
              ...(request.channelKey === "email" &&
              typeof normalized.metadata?.subject === "string"
                ? { emailSubject: normalized.metadata.subject }
                : {}),
            },
          });

          if (!prepared?.runtimeConfig.providerConnectionId) {
            if (request.channelKey === "email") {
              throw new Error("Published AI Employee runtime is not ready for inbound email execution.");
            }
            throw new ValidationError(
              "Published AI Employee runtime is not ready for inbound channel execution.",
            );
          }

          runtimeConfig = {
            ...prepared.runtimeConfig,
            executionPolicy: {
              ...(prepared.runtimeConfig.executionPolicy ?? {}),
              // Channel replies are sent only after the full text is ready.
              streaming: false,
              // Keep WhatsApp replies short — large max_tokens inflate latency.
              max_tokens: Math.min(
                Number(
                  (prepared.runtimeConfig.executionPolicy as { maxTokens?: number; max_tokens?: number } | undefined)
                    ?.max_tokens ??
                    (prepared.runtimeConfig.executionPolicy as { maxTokens?: number } | undefined)?.maxTokens ??
                    400,
                ) || 400,
                400,
              ),
            },
          };

          if (prepared.metadataPatch && this.ports.conversation.updateConversationMetadata) {
            const currentMetaForPatch =
              (await this.ports.conversation.getConversationMetadata?.(session.conversation_id)) ??
              conversationMetadata ??
              {};
            await this.ports.conversation.updateConversationMetadata({
              conversationId: session.conversation_id,
              metadata: {
                ...currentMetaForPatch,
                ...prepared.metadataPatch,
              },
            });
          }

          request.trace?.step("webhook.ai_employee_runtime_prepared", {
            aiEmployeeId,
            conversationId: session.conversation_id,
          });
        }

        if (!runtimeConfig?.providerConnectionId) {
          if (request.channelKey === "email") {
            throw new Error("runtimeConfig.providerConnectionId is required when executeAi is true.");
          }
          throw new ValidationError("runtimeConfig.providerConnectionId is required when executeAi is true.");
        }

        const resolvedRuntimeConfig = runtimeConfig;

        request.trace?.step("webhook.ai_runtime_started", {
          conversationId: session.conversation_id,
          aiEmployeeId: aiEmployeeId ?? null,
        });

        const emailSubject =
          typeof normalized.metadata?.subject === "string" ? normalized.metadata.subject.trim() : "";
        const aiMessageText =
          request.channelKey === "email" && emailSubject
            ? `Subject: ${emailSubject}\n\n${inboundText}`
            : inboundText;

        waPerfMarkInboundExecution("ai_runtime");
        const runtimeResult = await waPerfMeasure("OpenAI request", () =>
          this.ports.runtime.execute({
            companyId: request.companyId,
            conversationId: session.conversation_id,
            messageText: aiMessageText,
            runtimeConfig: resolvedRuntimeConfig,
            correlationId: inboundEvent.id,
            onStreamChunk: request.onStreamChunk,
            abortSignal: request.abortSignal,
          }),
        );

        runtimeExecutionId = runtimeResult.executionId;
        responseContent = runtimeResult.responseContent;

        if (!incomingMessageId) {
          incomingMessageId = await this.resolveInboundIncomingMessageId({
            inboundEvent,
            conversationId: session.conversation_id,
            externalMessageId: normalized.externalMessageId,
            request,
            normalized,
            inboundText,
            useWorkflow,
            incomingMessageId,
            lookupOnly: true,
          });
        }

        await this.inboundRepository.updateEvent({
          inboundEventId: inboundEvent.id,
          processingStatus: "processed",
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId,
          runtimeExecutionId,
          processedAt: new Date().toISOString(),
        });

        let outboundError: string | undefined;
        try {
          const outboundMetadata =
            request.channelKey === "email"
              ? {
                  recipientEmail: normalized.senderExternalId,
                  inReplyTo: normalized.externalMessageId,
                  emailSubject:
                    typeof normalized.metadata?.subject === "string" ? normalized.metadata.subject : undefined,
                  emailReferences: Array.isArray(normalized.metadata?.references)
                    ? normalized.metadata.references.map(String)
                    : undefined,
                  threadRootMessageId: normalized.externalThreadId,
                }
              : {};

          if (request.channelKey === "whatsapp") {
            logWhatsApp("Sending reply", {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              phoneNumber: normalized.senderExternalId,
              aiEmployeeId: aiEmployeeId ?? null,
              runtimeExecutionId,
              replyPreview: String(responseContent ?? "").slice(0, 160),
              executionTimeMs: Date.now() - pipelineStartedAt,
            });
          }

          const outbound = await this.dispatcher.dispatch(ctx, {
            companyId: request.companyId,
            companyChannelId: request.companyChannelId,
            channelKey: request.channelKey,
            conversationId: session.conversation_id,
            channelSessionId: session.id,
            externalThreadId: normalized.externalThreadId,
            text: responseContent,
            metadata: {
              runtimeExecutionId,
              correlationId: runtimeResult.correlationId,
              ...outboundMetadata,
            },
            persistConversationMessage: false,
          });

          outboundDeliveryId = outbound.deliveryEventId;

          if (
            request.channelKey === "email" &&
            outboundDeliveryId &&
            this.ports.aiEmployeeEmailCommercial
          ) {
            try {
              await this.ports.aiEmployeeEmailCommercial.recordUsage({
                companyId: request.companyId,
                inboundEventId: inboundEvent.id,
                aiEmployeeId: aiEmployeeId ?? null,
              });
            } catch {
              request.trace?.step("webhook.ai_employee_email_usage", {
                inboundEventId: inboundEvent.id,
                recorded: false,
                reason: "usage_record_failed",
              });
            }
          }

          if (request.channelKey === "whatsapp") {
            logWhatsApp("Reply completed", {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              phoneNumber: normalized.senderExternalId,
              aiEmployeeId: aiEmployeeId ?? null,
              runtimeExecutionId,
              outboundDeliveryId,
              executionTimeMs: Date.now() - pipelineStartedAt,
            });
          }
        } catch (error) {
          outboundError = error instanceof Error ? error.message : "outbound_dispatch_failed";
          request.trace?.step("webhook.outbound_failed", {
            runtimeExecutionId,
            error: outboundError,
          });
          if (request.channelKey === "whatsapp") {
            logWhatsAppError("WhatsApp sending reply failed", error, {
              companyId: request.companyId,
              companyChannelId: request.companyChannelId,
              conversationId: session.conversation_id,
              phoneNumber: normalized.senderExternalId,
              aiEmployeeId: aiEmployeeId ?? null,
              runtimeExecutionId,
              executionTimeMs: Date.now() - pipelineStartedAt,
            });
          }
        }

        return {
          inboundEventId: inboundEvent.id,
          conversationId: session.conversation_id,
          channelSessionId: session.id,
          incomingMessageId: incomingMessageId ?? "",
          runtimeExecutionId,
          outboundDeliveryId,
          outboundError,
          responseContent,
          emailRoutingClassification,
          emailRoutingDecision,
          emailRoutingTicket,
        };
        } catch (error) {
          if (request.channelKey !== "email") {
            throw error;
          }
          // Soft-fail Email AI Employee: keep inbound processed, no outbound claim.
          const message = error instanceof Error ? error.message : "ai_employee_email_failed";
          request.trace?.step("webhook.ai_employee_email_skipped", {
            inboundEventId: inboundEvent.id,
            reason: "execution_failed",
            error: message.slice(0, 160),
          });
          await this.inboundRepository.updateEvent({
            inboundEventId: inboundEvent.id,
            processingStatus: "processed",
            conversationId: session.conversation_id,
            channelSessionId: session.id,
            incomingMessageId,
            runtimeExecutionId,
            processedAt: new Date().toISOString(),
          });
          return {
            inboundEventId: inboundEvent.id,
            conversationId: session.conversation_id,
            channelSessionId: session.id,
            incomingMessageId: incomingMessageId ?? "",
            runtimeExecutionId,
            outboundDeliveryId,
            outboundError: message,
            responseContent,
            emailRoutingClassification,
            emailRoutingDecision,
            emailRoutingTicket,
          };
        }
      }

      await this.inboundRepository.updateEvent({
        inboundEventId: inboundEvent.id,
        processingStatus: "processed",
        conversationId: session.conversation_id,
        channelSessionId: session.id,
        incomingMessageId,
        runtimeExecutionId,
        processedAt: new Date().toISOString(),
      });

      return {
        inboundEventId: inboundEvent.id,
        conversationId: session.conversation_id,
        channelSessionId: session.id,
        incomingMessageId: incomingMessageId ?? "",
        runtimeExecutionId,
        outboundDeliveryId,
        responseContent,
        emailRoutingClassification,
        emailRoutingDecision,
        emailRoutingTicket,
      };
    } catch (error) {
      if (interactiveReplyId && !duplicate) {
        releaseInteractiveReplyDedupe({
          companyChannelId: request.companyChannelId,
          externalThreadId: request.externalThreadId,
          replyId: interactiveReplyId,
          contextMessageId: interactiveReplyContextId,
        });
      }
      const pipelineError =
        error instanceof Error ? error.message : "Inbound pipeline failed";
      waTraceNoteError(pipelineError);
      request.trace?.step("webhook.processing_failed", {
        inboundEventId: inboundEvent.id,
        error: pipelineError,
      });

      if (request.channelKey === "whatsapp") {
        logWhatsAppError("WhatsApp inbound pipeline failed", error, {
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          inboundEventId: inboundEvent.id,
          conversationId: request.conversationId ?? null,
          executionTimeMs: Date.now() - pipelineStartedAt,
        });
      }

      await this.inboundRepository.updateEvent({
        inboundEventId: inboundEvent.id,
        processingStatus: "failed",
        errorMessage: pipelineError,
        processedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  private async resolveInboundAutomationGate(input: {
    companyId: string;
    conversationId: string;
    request: InboundRouteRequestDto;
  }): Promise<{ allowAutomatedReply: boolean; reason: string; source: string }> {
    if (!this.ports.inboundAutomationGate) {
      return {
        allowAutomatedReply: true,
        reason: "gate_not_configured",
        source: "default_allow",
      };
    }

    try {
      const decision = await this.ports.inboundAutomationGate.evaluate({
        companyId: input.companyId,
        conversationId: input.conversationId,
      });
      return {
        allowAutomatedReply: Boolean(decision.allowAutomatedReply),
        reason: decision.reason || "unspecified",
        source: decision.source || "handoff_ownership",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 160) : "inbound_automation_gate_failed";
      input.request.trace?.step("webhook.inbound_automation_gate_error", {
        conversationId: input.conversationId,
        error: message,
      });
      // Fail closed when the gate is wired but fails — prefer silence over AI talking over a human.
      return {
        allowAutomatedReply: false,
        reason: "handoff_gate_error",
        source: "handoff_ownership",
      };
    }
  }

  private async resolveInboundIncomingMessageId(input: {
    inboundEvent: { id: string; incoming_message_id?: string | null };
    conversationId: string;
    externalMessageId?: string;
    request: InboundRouteRequestDto;
    normalized: { attachments?: unknown; metadata?: Record<string, unknown> };
    inboundText: string;
    useWorkflow: boolean;
    incomingMessageId?: string;
    lookupOnly?: boolean;
  }): Promise<string | undefined> {
    if (input.incomingMessageId?.trim()) {
      return input.incomingMessageId.trim();
    }
    if (input.inboundEvent.incoming_message_id?.trim()) {
      return input.inboundEvent.incoming_message_id.trim();
    }

    const finder = this.ports.conversation.findIncomingMessageForInboundEvent;
    if (finder) {
      const existing = await finder({
        conversationId: input.conversationId,
        inboundEventId: input.inboundEvent.id,
        externalMessageId: input.externalMessageId,
      });
      if (existing?.id) {
        return existing.id;
      }
    }

    if (input.lookupOnly) {
      return undefined;
    }

    if (!input.useWorkflow && input.request.executeAi) {
      // executeAi path persists the incoming row inside runtime; idempotent add handles retries.
      return undefined;
    }

    return undefined;
  }

  private async classifyInboundEmailRouting(input: {
    companyId: string;
    subject: string | null;
    body: string;
    inboundEventId: string;
    trace?: InboundRouteRequestDto["trace"];
  }): Promise<EmailRoutingClassificationRuntime | undefined> {
    if (!this.emailRoutingClassifier) return undefined;

    try {
      const result = await this.emailRoutingClassifier.classify({
        subject: input.subject,
        body: input.body,
        companyId: input.companyId,
      });
      const runtime = toEmailRoutingClassificationRuntime(result);
      input.trace?.step("webhook.email_routing_classified", {
        inboundEventId: input.inboundEventId,
        companyId: input.companyId,
        category: runtime.category,
        confidence: runtime.confidence,
        source: runtime.source,
        success: true,
      });
      return runtime;
    } catch (error) {
      // Sprint 2 classifier should not throw; if the port does, never fail ingestion.
      const reason =
        error instanceof Error ? error.message.slice(0, 120) : "email_routing_classifier_failed";
      const runtime: EmailRoutingClassificationRuntime = {
        category: "general_inquiry",
        confidence: 0.1,
        subcategory: null,
        reason: `Email routing classification failed: ${reason}`,
        source: "llm",
      };
      input.trace?.step("webhook.email_routing_classified", {
        inboundEventId: input.inboundEventId,
        companyId: input.companyId,
        category: runtime.category,
        confidence: runtime.confidence,
        source: runtime.source,
        success: false,
      });
      return runtime;
    }
  }

  private async decideInboundEmailRouting(input: {
    companyId: string;
    classification: EmailRoutingClassificationRuntime;
    inboundEventId: string;
    trace?: InboundRouteRequestDto["trace"];
  }): Promise<EmailRoutingDecisionRuntime | undefined> {
    if (!this.emailRoutingEngine) return undefined;

    try {
      const result = await this.emailRoutingEngine.route({
        companyId: input.companyId,
        classification: input.classification,
      });
      const runtime = toEmailRoutingDecisionRuntime(result);
      input.trace?.step("webhook.email_routing_decided", {
        inboundEventId: input.inboundEventId,
        companyId: input.companyId,
        category: runtime.category,
        targetType: runtime.targetType,
        targetId: runtime.targetId,
        confidence: runtime.confidence,
        configurationRequired: runtime.configurationRequired,
        success: true,
      });
      return runtime;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.slice(0, 120) : "email_routing_engine_failed";
      const runtime: EmailRoutingDecisionRuntime = {
        targetType: "unresolved",
        targetId: null,
        category: "general_inquiry",
        confidence: input.classification.confidence,
        reason: `Email routing decision failed: ${reason}`,
        source: "classification",
        configurationRequired: true,
      };
      input.trace?.step("webhook.email_routing_decided", {
        inboundEventId: input.inboundEventId,
        companyId: input.companyId,
        category: runtime.category,
        targetType: runtime.targetType,
        targetId: runtime.targetId,
        confidence: runtime.confidence,
        configurationRequired: runtime.configurationRequired,
        success: false,
      });
      return runtime;
    }
  }

  /**
   * Phase 2 — resolve WhatsApp sender → CRM customer.
   * WhatsApp phone is authoritative. Never silently trust a stale conversation.customer_id
   * that conflicts with the sender. Never overwrite customer_id on conflict/ambiguous.
   * Stamp metadata.trustedChannelCustomerId so tool-router/execute prefer WA identity.
   * Never trusts senderName / LLM ids.
   */
  private async resolveAndBindTrustedChannelCustomer(input: {
    companyId: string;
    channelKey: string;
    conversationId: string;
    senderExternalId: string | null | undefined;
    trace?: InboundRouteRequestDto["trace"];
  }): Promise<{
    customerId: string | null;
    trustedCustomerName: string | null;
    status: string;
  }> {
    const empty = { customerId: null, trustedCustomerName: null, status: "skipped" as const };

    if (!this.ports.customerIdentity) return empty;
    if (input.channelKey !== "whatsapp") return empty;

    const existing = this.ports.conversation.getConversationCustomerId
      ? await this.ports.conversation.getConversationCustomerId(input.conversationId)
      : null;

    const resolved = await this.ports.customerIdentity.resolveTrustedCustomer({
      companyId: input.companyId,
      channelKey: input.channelKey,
      senderExternalId: input.senderExternalId,
    });

    input.trace?.step("webhook.channel_identity", {
      status: resolved.status,
      conversationId: input.conversationId,
      customerId: resolved.customerId,
      existingCustomerId: existing,
      hasTrustedName: Boolean(resolved.trustedCustomerName),
    });

    const persistIdentityStamp = async (stamp: {
      status: string;
      trustedChannelCustomerId: string | null;
      trustedCustomerName?: string | null;
    }) => {
      if (
        !this.ports.conversation.updateConversationMetadata ||
        !this.ports.conversation.getConversationMetadata
      ) {
        return;
      }
      const currentMeta =
        (await this.ports.conversation.getConversationMetadata(input.conversationId)) ?? {};
      const nextMeta: Record<string, unknown> = {
        ...currentMeta,
        channelIdentityStatus: stamp.status,
        // Explicit null is intentional — tells tool-router not to trust conversation.customer_id.
        trustedChannelCustomerId: stamp.trustedChannelCustomerId,
      };
      if (stamp.trustedCustomerName?.trim()) {
        nextMeta.trustedCustomerName = stamp.trustedCustomerName.trim();
      }
      await this.ports.conversation.updateConversationMetadata({
        conversationId: input.conversationId,
        metadata: nextMeta,
      });
    };

    const hydrateNameForExisting = async (
      customerId: string,
      preferredName: string | null,
    ): Promise<string | null> => {
      if (preferredName?.trim()) return preferredName.trim();
      const meta = this.ports.conversation.getConversationMetadata
        ? await this.ports.conversation.getConversationMetadata(input.conversationId)
        : null;
      const fromMeta =
        typeof meta?.trustedCustomerName === "string" && meta.trustedCustomerName.trim()
          ? meta.trustedCustomerName.trim()
          : null;
      if (fromMeta) return fromMeta;
      const row = this.ports.customerIdentity?.getCustomerById
        ? await this.ports.customerIdentity.getCustomerById({
            companyId: input.companyId,
            customerId,
          })
        : null;
      return typeof row?.name === "string" && row.name.trim() ? row.name.trim() : null;
    };

    // Ambiguous / invalid sender — fail closed. Do not overwrite or reuse stale bind.
    if (
      resolved.status === "ambiguous" ||
      resolved.status === "invalid_sender" ||
      resolved.status === "unsupported_channel"
    ) {
      await persistIdentityStamp({
        status: resolved.status,
        trustedChannelCustomerId: null,
      });
      return {
        customerId: null,
        trustedCustomerName: null,
        status: resolved.status,
      };
    }

    // Exactly one CRM match for WhatsApp sender.
    if (resolved.status === "known" && resolved.customerId) {
      const conflict = Boolean(existing && existing !== resolved.customerId);
      if (conflict) {
        // Stale bind conflicts with authoritative WhatsApp identity — do not overwrite
        // conversation.customer_id, but stamp/use the WA-resolved customer for tools.
        input.trace?.step("webhook.channel_identity_conflict", {
          conversationId: input.conversationId,
          existingCustomerId: existing,
          resolvedCustomerId: resolved.customerId,
        });
      } else if (!existing) {
        await this.ports.conversation.linkConversationCustomerIfEmpty?.({
          conversationId: input.conversationId,
          customerId: resolved.customerId,
          companyId: input.companyId,
        });
      }

      const trustedName = await hydrateNameForExisting(
        resolved.customerId,
        resolved.trustedCustomerName,
      );
      const status = conflict
        ? "conflict_stale_bind"
        : existing
          ? "reused_consistent"
          : "known";
      await persistIdentityStamp({
        status,
        trustedChannelCustomerId: resolved.customerId,
        trustedCustomerName: trustedName,
      });
      return {
        customerId: resolved.customerId,
        trustedCustomerName: trustedName,
        status,
      };
    }

    // Zero CRM phone matches.
    if (existing) {
      const consistency = this.ports.customerIdentity.customerMatchesWhatsAppSender
        ? await this.ports.customerIdentity.customerMatchesWhatsAppSender({
            companyId: input.companyId,
            customerId: existing,
            senderExternalId: input.senderExternalId,
          })
        : { matches: false, name: null };

      if (consistency.matches) {
        const trustedName = await hydrateNameForExisting(existing, consistency.name);
        await persistIdentityStamp({
          status: "reused_phone_consistent",
          trustedChannelCustomerId: existing,
          trustedCustomerName: trustedName,
        });
        return {
          customerId: existing,
          trustedCustomerName: trustedName,
          status: "reused_phone_consistent",
        };
      }

      // Existing bind is not consistent with WhatsApp sender — fail closed (no overwrite).
      input.trace?.step("webhook.channel_identity_conflict", {
        conversationId: input.conversationId,
        existingCustomerId: existing,
        resolvedCustomerId: null,
        reason: "zero_match_stale_bind",
      });
      await persistIdentityStamp({
        status: "conflict_stale_bind",
        trustedChannelCustomerId: null,
      });
      return {
        customerId: null,
        trustedCustomerName: null,
        status: "conflict_stale_bind",
      };
    }

    await persistIdentityStamp({
      status: "unknown",
      trustedChannelCustomerId: null,
    });
    return {
      customerId: null,
      trustedCustomerName: null,
      status: "unknown",
    };
  }

  private assertRoutePermission(ctx: ServiceContext, companyId: string): void {
    if (ctx.isSuperAdmin) return;
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.route);
    }
    if (!ctx.hasPermission(CHANNEL_PLATFORM_PERMISSIONS.route)) {
      throw new PermissionDeniedError(CHANNEL_PLATFORM_PERMISSIONS.route);
    }
  }

  private async resolveCompanyChannel(
    companyChannelId: string,
    companyId: string,
  ): Promise<ResolvedCompanyChannel> {
    const companyChannel = await this.ports.registry.getCompanyChannel(companyChannelId);
    if (!companyChannel || companyChannel.companyId !== companyId) {
      throw new CompanyChannelNotFoundError(companyChannelId);
    }
    if (!companyChannel.isEnabled) {
      throw new ValidationError("Company channel must be enabled.");
    }
    return companyChannel;
  }
}
