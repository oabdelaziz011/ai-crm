import type { RuntimeExecutionRequest, RuntimeExecutionResponse, RuntimeStep } from "../dto/runtime-dto.js";
import { toRuntimeExecutionResponse, toRuntimeStep } from "../dto/runtime-dto.js";
import { RUNTIME_PERMISSIONS, type RuntimePipelineStage } from "../constants.js";
import {
  ConversationNotFoundError,
  PermissionDeniedError,
  RuntimeErrorCatalogService,
  ValidationError,
} from "../errors/error-catalog.js";
import type { RuntimePolicyEngine } from "../engines/runtime-policy-engine.js";
import type { RuntimeEnginePorts } from "../ports/runtime-ports.js";
import type { RuntimeTelemetryPort } from "../ports/observability-port.js";
import type {
  RuntimeErrorRepository,
  RuntimeExecutionRepository,
  RuntimeSessionRepository,
  RuntimeStepRepository,
} from "../repositories/runtime-repositories.js";
import type {
  ExecutionSnapshot,
  IntentSnapshot,
  PromptSnapshot,
  RetrievalSnapshot,
  ServiceContext,
} from "../types.js";
import { createCorrelationId } from "../utils/runtime-utils.js";

function assertPermission(ctx: ServiceContext, permission: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission, correlationId);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string, correlationId?: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(RUNTIME_PERMISSIONS.view, correlationId);
  }
}

/**
 * The ONLY orchestration component.
 * Coordinates existing engines — owns no AI logic.
 */
export class EnterpriseRuntimeCoordinator {
  private readonly errorCatalog = new RuntimeErrorCatalogService();

  constructor(
    private readonly ports: RuntimeEnginePorts,
    private readonly policyEngine: RuntimePolicyEngine,
    private readonly sessionRepository: RuntimeSessionRepository,
    private readonly executionRepository: RuntimeExecutionRepository,
    private readonly stepRepository: RuntimeStepRepository,
    private readonly errorRepository: RuntimeErrorRepository,
    private readonly telemetryPort: RuntimeTelemetryPort,
  ) {}

  async execute(ctx: ServiceContext, input: RuntimeExecutionRequest): Promise<RuntimeExecutionResponse> {
    const correlationId = createCorrelationId(input.correlationId);
    const startedAt = Date.now();
    const stepDtos: RuntimeStep[] = [];

    assertPermission(ctx, RUNTIME_PERMISSIONS.execute, correlationId);
    assertCompanyAccess(ctx, input.companyId, correlationId);

    if (!input.messageText.trim()) {
      throw new ValidationError("messageText is required.", correlationId);
    }

    const policy = await this.policyEngine.resolvePolicy(
      ctx,
      input.companyId,
      { policyId: input.policyId },
      correlationId,
    );

    let session =
      (await this.sessionRepository.findByConversation(input.conversationId)) ??
      (await this.sessionRepository.createSession({
        companyId: input.companyId,
        conversationId: input.conversationId,
        correlationId,
      }));

    const execution = await this.executionRepository.createExecution({
      companyId: input.companyId,
      sessionId: session.id,
      conversationId: input.conversationId,
      policyId: policy.policyId,
      correlationId,
      metadata: { messagePreview: input.messageText.slice(0, 120) },
    });

    let intent: IntentSnapshot | null = null;
    let retrieval: RetrievalSnapshot | null = null;
    let vectorQueryExecutionId: string | null = null;
    let retrievalExecutionId: string | null = null;
    let prompt: PromptSnapshot | null = null;
    let aiExecution: ExecutionSnapshot | null = null;
    let providerKey: string | null = null;
    let responseContent = "";

    try {
      // 1. Conversation
      const conversation = await this.runStage(ctx, execution.id, "conversation", stepDtos, correlationId, async () => {
        const record = await this.ports.conversation.findConversation(input.conversationId);
        if (!record || record.companyId !== input.companyId) {
          throw new ConversationNotFoundError(input.conversationId, correlationId);
        }
        await this.ports.conversation.addIncomingMessage(ctx, {
          conversationId: input.conversationId,
          content: input.messageText,
          metadata: { correlationId },
        });
        return record;
      });

      // 2. State
      const conversationState = await this.runStage(ctx, execution.id, "state", stepDtos, correlationId, async () =>
        this.ports.state.getCurrentState(ctx, input.conversationId),
      );

      // 3. Intent
      intent = await this.runStage(ctx, execution.id, "intent", stepDtos, correlationId, async () =>
        this.ports.intent.resolveIntent(ctx, {
          conversationId: input.conversationId,
          messageText: input.messageText,
        }),
      );

      if (intent.requiresHuman) {
        responseContent = "Your request has been escalated for human review.";
        await this.skipRemainingStages(execution.id, ["retrieval", "prompt", "execution", "provider"], stepDtos);
      } else {
        // 4. Retrieval
        const knowledgeRetrieval = input.knowledgeRetrieval;
        const hasLegacyVector = Boolean(
          knowledgeRetrieval?.queryVector?.length || knowledgeRetrieval?.embeddingId,
        );
        const hasQuestionRetrieval = Boolean(
          knowledgeRetrieval?.collectionId &&
            knowledgeRetrieval.embeddingConnectionId &&
            (knowledgeRetrieval.vectorStoreConnectionId || knowledgeRetrieval.connectionId),
        );

        if (
          policy.knowledgeRetrievalEnabled &&
          knowledgeRetrieval &&
          (hasLegacyVector || hasQuestionRetrieval) &&
          !intent.requiresHuman
        ) {
          const retrievalResult = await this.runStage(
            ctx,
            execution.id,
            "retrieval",
            stepDtos,
            correlationId,
            async () =>
              this.ports.retrieval.runRetrieval(ctx, {
                companyId: input.companyId,
                correlationId,
                question: input.messageText,
                embeddingConnectionId: knowledgeRetrieval.embeddingConnectionId,
                vectorStoreConnectionId:
                  knowledgeRetrieval.vectorStoreConnectionId ?? knowledgeRetrieval.connectionId,
                connectionId: knowledgeRetrieval.connectionId,
                collectionId: knowledgeRetrieval.collectionId,
                queryVector: knowledgeRetrieval.queryVector,
                embeddingId: knowledgeRetrieval.embeddingId,
              }),
          );
          vectorQueryExecutionId = retrievalResult.vectorQueryExecutionId;
          retrieval = retrievalResult.retrieval;
          retrievalExecutionId = retrieval.executionId;
        } else {
          await this.skipStage(execution.id, "retrieval", stepDtos, {
            reason: policy.knowledgeRetrievalEnabled ? "knowledge_params_missing" : "knowledge_disabled",
          });
        }

        const recentMessages = await this.ports.conversation.listRecentMessages(
          input.conversationId,
          input.pageContext?.channelKey ? 6 : 10,
        );

        // 5. Prompt
        prompt = await this.runStage(ctx, execution.id, "prompt", stepDtos, correlationId, async () =>
          this.ports.prompt.buildPrompt(ctx, {
            companyId: input.companyId,
            conversationId: input.conversationId,
            conversationState,
            messageText: input.messageText,
            recentMessages,
            intent: intent!,
            retrieval,
            pageContext: input.pageContext,
          }),
        );

        // 6. Execution
        aiExecution = await this.runStage(ctx, execution.id, "execution", stepDtos, correlationId, async () =>
          this.ports.execution.execute(ctx, {
            companyId: input.companyId,
            conversationId: input.conversationId,
            promptBuildId: prompt!.buildId,
            providerConnectionId: input.providerConnectionId,
            policy: input.executionPolicy,
            onStreamChunk: input.onStreamChunk,
            abortSignal: input.abortSignal,
          }),
        );

        // 7. Provider (metadata only — execution engine already invoked adapter)
        const provider = await this.runStage(ctx, execution.id, "provider", stepDtos, correlationId, async () =>
          this.ports.provider.resolveProvider(ctx, {
            companyId: input.companyId,
            providerConnectionId: input.providerConnectionId,
          }),
        );
        providerKey = provider.providerKey;
        responseContent = aiExecution.responseContent;
      }

      // 8. Response
      await this.runStage(ctx, execution.id, "response", stepDtos, correlationId, async () => ({
        content: responseContent,
      }));

      // 9. Persistence
      await this.runStage(ctx, execution.id, "persistence", stepDtos, correlationId, async () => {
        await this.ports.conversation.addOutgoingMessage(ctx, {
          conversationId: input.conversationId,
          content: responseContent,
          metadata: {
            correlationId,
            runtimeExecutionId: execution.id,
            intentKey: intent?.intentKey ?? null,
          },
        });
        return { persisted: true };
      });

      const executionTimeMs = Date.now() - startedAt;

      // 10. Observability
      await this.runStage(ctx, execution.id, "observability", stepDtos, correlationId, async () => {
        await this.telemetryPort.recordExecution({
          runtimeId: session.id,
          executionId: execution.id,
          companyId: input.companyId,
          conversationId: input.conversationId,
          correlationId,
          intentKey: intent?.intentKey ?? null,
          providerKey: providerKey ?? aiExecution?.providerKey ?? null,
          model: aiExecution?.model ?? null,
          aiExecutionId: aiExecution?.executionId ?? null,
          promptBuildId: prompt?.buildId ?? null,
          pipelineStage: "completed",
          executionTimeMs,
          latencyMs: aiExecution?.latencyMs ?? executionTimeMs,
          tokenUsageTotal: aiExecution?.tokenUsage.totalTokens ?? 0,
          tokenUsage: aiExecution?.tokenUsage,
        });
        return { recorded: true };
      });

      const completed = await this.executionRepository.completeExecution(execution.id, {
        executionTimeMs,
        intentKey: intent?.intentKey ?? null,
        providerKey: providerKey ?? aiExecution?.providerKey ?? null,
        promptBuildId: prompt?.buildId ?? null,
        aiExecutionId: aiExecution?.executionId ?? null,
        retrievalExecutionId,
        vectorQueryExecutionId,
        metadata: {
          conversationState,
          conversationId: conversation.id,
        },
      });

      await this.sessionRepository.updateStatus(session.id, "completed");

      return toRuntimeExecutionResponse({
        runtimeId: session.id,
        executionId: completed.id,
        session: {
          sessionId: session.id,
          conversationId: session.conversation_id,
          correlationId: session.correlation_id,
          status: "completed",
        },
        correlationId: completed.correlation_id,
        executionTimeMs,
        intentKey: intent?.intentKey ?? null,
        providerKey: providerKey ?? aiExecution?.providerKey ?? null,
        responseContent,
        steps: stepDtos,
        tokenUsage: aiExecution?.tokenUsage ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });
    } catch (error) {
      const normalized = this.errorCatalog.normalize(error, correlationId);
      const executionTimeMs = Date.now() - startedAt;
      const failedStep = stepDtos.find((step) => step.status === "failed");

      await this.errorRepository.saveError({
        executionId: execution.id,
        errorCode: normalized.code,
        errorCategory: normalized.category,
        humanMessage: normalized.humanMessage,
        developerMessage: normalized.developerMessage,
        correlationId,
        recoverable: normalized.recoverable,
        metadata: { stage: failedStep?.stage ?? "unknown" },
      });

      await this.executionRepository.failExecution(execution.id, {
        executionTimeMs,
        errorMessage: normalized.developerMessage,
      });
      await this.sessionRepository.updateStatus(session.id, "failed");

      await this.telemetryPort.recordExecution({
        runtimeId: session.id,
        executionId: execution.id,
        companyId: input.companyId,
        conversationId: input.conversationId,
        correlationId,
        intentKey: intent?.intentKey ?? null,
        providerKey: providerKey ?? aiExecution?.providerKey ?? null,
        model: aiExecution?.model ?? null,
        aiExecutionId: aiExecution?.executionId ?? null,
        promptBuildId: prompt?.buildId ?? null,
        pipelineStage: "failed",
        executionTimeMs,
        latencyMs: aiExecution?.latencyMs ?? executionTimeMs,
        tokenUsageTotal: aiExecution?.tokenUsage.totalTokens ?? 0,
        tokenUsage: aiExecution?.tokenUsage,
        error: normalized.developerMessage,
      });

      throw Object.assign(error instanceof Error ? error : new Error(normalized.developerMessage), {
        execution,
        normalizedError: normalized,
        steps: stepDtos,
      });
    }
  }

  private async runStage<T>(
    ctx: ServiceContext,
    executionId: string,
    stage: RuntimePipelineStage,
    stepDtos: RuntimeStep[],
    correlationId: string,
    handler: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    const step = await this.stepRepository.createStep({ executionId, stage });

    try {
      const result = await handler();
      const durationMs = Date.now() - startedAt;
      await this.stepRepository.completeStep(step.id, { durationMs });
      stepDtos.push(toRuntimeStep({ stage, status: "completed", durationMs }));
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const normalized = this.errorCatalog.normalize(error, correlationId);
      await this.stepRepository.failStep(step.id, {
        durationMs,
        metadata: { errorCode: normalized.code },
      });
      stepDtos.push(toRuntimeStep({ stage, status: "failed", durationMs, metadata: { errorCode: normalized.code } }));
      throw error;
    }
  }

  private async skipStage(
    executionId: string,
    stage: RuntimePipelineStage,
    stepDtos: RuntimeStep[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const step = await this.stepRepository.createStep({ executionId, stage, metadata });
    await this.stepRepository.skipStep(step.id, { metadata });
    stepDtos.push(toRuntimeStep({ stage, status: "skipped", durationMs: 0, metadata }));
  }

  private async skipRemainingStages(
    executionId: string,
    stages: RuntimePipelineStage[],
    stepDtos: RuntimeStep[],
  ): Promise<void> {
    for (const stage of stages) {
      await this.skipStage(executionId, stage, stepDtos, { reason: "human_escalation" });
    }
  }
}
