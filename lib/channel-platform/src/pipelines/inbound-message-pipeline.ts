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
import type { ChannelWorkflowResolver } from "../services/channel-workflow-resolver.js";
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
} from "../adapters/whatsapp/whatsapp-direct-outbound-bypass.js";

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
  ) {}

  async process(ctx: ServiceContext, request: InboundRouteRequestDto): Promise<InboundRouteResponseDto> {
    this.assertRoutePermission(ctx, request.companyId);

    const companyChannel = await this.resolveCompanyChannel(request.companyChannelId, request.companyId);
    const adapter = this.adapterRegistry.require(request.channelKey);
    const idempotencyKey = request.idempotencyKey ?? randomUUID();

    const duplicate = await this.inboundRepository.findByIdempotencyKey(
      request.companyChannelId,
      idempotencyKey,
    );
    if (
      duplicate?.processing_status === "processed" ||
      (duplicate?.processing_status === "failed" && duplicate.runtime_execution_id)
    ) {
      return {
        inboundEventId: duplicate.id,
        conversationId: duplicate.conversation_id ?? request.conversationId ?? "",
        channelSessionId: duplicate.channel_session_id ?? "",
        incomingMessageId: duplicate.incoming_message_id ?? "",
        runtimeExecutionId: duplicate.runtime_execution_id ?? undefined,
        duplicate: true,
      };
    }

    const inboundEvent = duplicate
      ? duplicate
      : await this.inboundRepository.createEvent({
          companyId: request.companyId,
          companyChannelId: request.companyChannelId,
          channelKey: request.channelKey,
          idempotencyKey,
          externalThreadId: request.externalThreadId,
          externalMessageId: request.externalMessageId,
          senderExternalId: request.senderExternalId,
          payload: request.payload,
        });

    request.trace?.step("webhook.inbound_event_created", {
      inboundEventId: inboundEvent.id,
      duplicate: Boolean(duplicate),
    });

    await this.inboundRepository.updateEvent({
      inboundEventId: inboundEvent.id,
      processingStatus: "processing",
    });

    try {
      const normalized = adapter.normalizeInbound({ companyChannel }, request.payload);

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

      traceParsedInboundMessage({
        channelKey: request.channelKey,
        externalUserId: normalized.senderExternalId ?? normalized.externalThreadId,
        text: inboundText,
        metadata: normalized.metadata ?? {},
      });

      const workflowResolution = this.workflowResolver
        ? await this.workflowResolver.resolveDetail(request.companyChannelId)
        : { status: "skipped" as const, reason: "no_binding" as const };
      const resolvedWorkflow =
        workflowResolution.status === "resolved" ? workflowResolution.workflow : null;
      const useWorkflow = Boolean(resolvedWorkflow && this.ports.automation);

      request.trace?.step(
        useWorkflow ? "webhook.workflow_resolved" : "webhook.workflow_missing",
        useWorkflow && resolvedWorkflow
          ? {
              automationFlowId: resolvedWorkflow.automationFlowId,
            }
          : {
              companyChannelId: request.companyChannelId,
              skipReason: workflowResolution.status === "skipped" ? workflowResolution.reason : "no_binding",
              ...(workflowResolution.status === "skipped" && workflowResolution.automationFlowId
                ? { automationFlowId: workflowResolution.automationFlowId }
                : {}),
            },
      );

      if (request.executeAi && !useWorkflow && !request.aiAssistantId) {
        throw new ValidationError("aiAssistantId is required when executeAi is true.");
      }

      const session = await this.sessionEngine.resolveSession(ctx, {
        companyId: request.companyId,
        companyChannelId: request.companyChannelId,
        channelKey: request.channelKey,
        externalThreadId: normalized.externalThreadId,
        senderExternalId: normalized.senderExternalId,
        conversationId: request.conversationId,
        aiAssistantId: request.aiAssistantId,
        requireAiAssistant: !useWorkflow,
        metadata: normalized.metadata,
      });

      await this.sessionRepository.touchInbound(session.id);
      request.trace?.step("webhook.session_resolved", {
        channelSessionId: session.id,
        conversationId: session.conversation_id,
        requireAiAssistant: !useWorkflow,
      });

      let incomingMessageId: string | undefined;

      if (!request.executeAi || useWorkflow) {
        const incomingMessage = await this.ports.conversation.addIncomingMessage({
          conversationId: session.conversation_id,
          content: inboundText,
          externalMessageId: normalized.externalMessageId,
          metadata: {
            channelKey: request.channelKey,
            source: request.source,
            attachments: normalized.attachments,
            ...(normalized.metadata ?? {}),
          },
        });
        incomingMessageId = incomingMessage.id;
      }

      if (
        this.whatsAppDirectOutboundBypass?.enabled &&
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
        };
      }

      let runtimeExecutionId: string | undefined;
      let automationRunId: string | undefined;
      let outboundDeliveryId: string | undefined;
      let outboundDeliveryIds: string[] | undefined;
      let responseContent: string | undefined;

      if (useWorkflow && resolvedWorkflow && this.ports.automation) {
        const automation = this.ports.automation;
        request.trace?.step("webhook.automation_started", {
          flowId: resolvedWorkflow.automationFlowId,
        });

        const automationResult = await automation.startWorkflow({
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
            ...(normalized.metadata ?? {}),
          },
        });

        automationRunId = automationResult.runId;
        responseContent = automationResult.responseContent;
        const outboundMessages = automationResult.outboundMessages ?? [];

        request.trace?.step("webhook.automation_completed", {
          automationRunId,
          outboundMessageCount: outboundMessages.length,
          hasResponseContent: Boolean(responseContent?.trim()),
        });

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
            request.trace?.step("webhook.outbound_failed", {
              automationRunId,
              error: error instanceof Error ? error.message : "outbound_dispatch_failed",
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
            request.trace?.step("webhook.outbound_failed", {
              automationRunId,
              error: error instanceof Error ? error.message : "outbound_dispatch_failed",
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
        };
      }

      if (!useWorkflow && request.executeAi) {
        if (!request.runtimeConfig?.providerConnectionId) {
          throw new ValidationError("runtimeConfig.providerConnectionId is required when executeAi is true.");
        }

        request.trace?.step("webhook.ai_runtime_started", {
          conversationId: session.conversation_id,
        });

        const runtimeResult = await this.ports.runtime.execute({
          companyId: request.companyId,
          conversationId: session.conversation_id,
          messageText: inboundText,
          runtimeConfig: request.runtimeConfig,
          correlationId: inboundEvent.id,
          onStreamChunk: request.onStreamChunk,
          abortSignal: request.abortSignal,
        });

        runtimeExecutionId = runtimeResult.executionId;
        responseContent = runtimeResult.responseContent;

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
        } catch (error) {
          outboundError = error instanceof Error ? error.message : "outbound_dispatch_failed";
          request.trace?.step("webhook.outbound_failed", {
            runtimeExecutionId,
            error: outboundError,
          });
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
        };
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
      };
    } catch (error) {
      request.trace?.step("webhook.processing_failed", {
        inboundEventId: inboundEvent.id,
        error: error instanceof Error ? error.message : "Inbound pipeline failed",
      });

      await this.inboundRepository.updateEvent({
        inboundEventId: inboundEvent.id,
        processingStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "Inbound pipeline failed",
        processedAt: new Date().toISOString(),
      });
      throw error;
    }
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
