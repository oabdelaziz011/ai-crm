import type { ConversationServices, ServiceContext as ConversationServiceContext } from "@workspace/ai-conversation";
import type { IntentEngineServices } from "@workspace/ai-intent-engine";
import type { AIExecutionServices, EnterpriseAIRuntimeService } from "@workspace/ai-execution-engine";
import type { AIProviderServices } from "@workspace/ai-provider-layer";
import type { PromptOrchestratorServices } from "@workspace/ai-prompt-orchestrator";
import type { RetrievalServices } from "@workspace/retrieval-engine";
import type { VectorQueryServices } from "@workspace/vector-query";
import type { Customer360Loader } from "@workspace/customer-360";
import type { KnowledgeRuntimeProvider } from "@workspace/knowledge-runtime";
import type { RuntimeEnginePorts } from "../ports/runtime-ports.js";
import type { ServiceContext } from "../types.js";
import {
  formatRetrievalInstructions,
  mapRetrievalSnapshotToKnowledgeContext,
} from "../utils/runtime-utils.js";

export type RuntimeEngineDependencies = {
  conversation: ConversationServices;
  intent: IntentEngineServices;
  vectorQuery: VectorQueryServices;
  retrieval: RetrievalServices;
  prompt: PromptOrchestratorServices;
  execution: AIExecutionServices;
  provider: AIProviderServices;
};

export type RuntimeEnginePortOptions = {
  customer360Loader?: Customer360Loader;
  knowledgeRuntimeProvider?: KnowledgeRuntimeProvider;
  resolveActorUserId?: (companyId: string) => Promise<string | null>;
  /** Dashboard chat uses conversation orchestration + tools; webhooks use template-only builds. */
  promptMode?: "webhook" | "dashboard";
};

function readSenderHint(
  metadata: Record<string, unknown>,
  pageContext?: Record<string, unknown>,
): { senderEmail?: string | null; senderPhone?: string | null } {
  const merged = { ...metadata, ...(pageContext ?? {}) };
  const senderExternalId =
    typeof merged.senderExternalId === "string"
      ? merged.senderExternalId
      : typeof merged.externalUserId === "string"
        ? merged.externalUserId
        : null;

  if (senderExternalId?.includes("@")) {
    return { senderEmail: senderExternalId.toLowerCase(), senderPhone: null };
  }

  if (senderExternalId && /\d{7,}/.test(senderExternalId)) {
    return { senderEmail: null, senderPhone: senderExternalId };
  }

  return {
    senderEmail: typeof merged.senderEmail === "string" ? merged.senderEmail : null,
    senderPhone: typeof merged.senderPhone === "string" ? merged.senderPhone : null,
  };
}

function requireEnterpriseRuntime(
  execution: AIExecutionServices,
): EnterpriseAIRuntimeService {
  if (!execution.enterpriseRuntime) {
    throw new Error("Enterprise AI Runtime is not configured. Wire prompt + gateway integrations.");
  }
  return execution.enterpriseRuntime;
}

function asConversationContext(ctx: ServiceContext): ConversationServiceContext {
  return ctx as ConversationServiceContext;
}

export function createRuntimeEnginePorts(deps: RuntimeEngineDependencies): RuntimeEnginePorts {
  return {
    conversation: {
      async findConversation(conversationId) {
        throw new Error("findConversation requires ServiceContext — use coordinator ports with ctx-aware adapters.");
      },
      async listRecentMessages(conversationId, limit = 10) {
        throw new Error("listRecentMessages requires ServiceContext.");
      },
      async addIncomingMessage(ctx, input) {
        const message = await deps.conversation.messages.addMessage(asConversationContext(ctx), {
          conversationId: input.conversationId,
          messageType: "incoming",
          content: input.content,
          metadata: input.metadata,
        });
        return {
          id: message.id,
          role: "customer",
          content: message.content,
          createdAt: message.created_at,
        };
      },
      async addOutgoingMessage(ctx, input) {
        const message = await deps.conversation.messages.addMessage(asConversationContext(ctx), {
          conversationId: input.conversationId,
          messageType: "outgoing",
          content: input.content,
          metadata: input.metadata,
        });
        return {
          id: message.id,
          role: "assistant",
          content: message.content,
          createdAt: message.created_at,
        };
      },
    },
    state: {
      async getCurrentState(ctx, conversationId) {
        return deps.conversation.state.getCurrentState(asConversationContext(ctx), conversationId);
      },
    },
    intent: {
      async resolveIntent(ctx, input) {
        const result = await deps.intent.engine.resolve(asConversationContext(ctx), input);
        return {
          intentKey: result.intent_key,
          confidence: result.confidence,
          matchedTool: result.matched_tool,
          reason: result.reason,
          requiresHuman: result.requires_human,
          requiresLlm: result.requires_llm,
          status: result.status,
        };
      },
    },
    retrieval: {
      async runRetrieval(ctx, input) {
        if (input.queryVector || input.embeddingId) {
          const vectorStoreConnectionId = input.vectorStoreConnectionId ?? input.connectionId;
          if (!vectorStoreConnectionId) {
            throw new Error("vectorStoreConnectionId or connectionId is required for legacy retrieval.");
          }

          const vectorQuery = await deps.vectorQuery.management.executeQuery(asConversationContext(ctx), {
            companyId: input.companyId,
            connectionId: vectorStoreConnectionId,
            collectionId: input.collectionId,
            queryVector: input.queryVector,
            embeddingId: input.embeddingId,
            correlationId: input.correlationId,
          });

          const retrieval = await deps.retrieval.retrieval.retrieve(asConversationContext(ctx), {
            companyId: input.companyId,
            vectorQueryExecutionId: vectorQuery.executionId,
            correlationId: input.correlationId,
          });

          return {
            vectorQueryExecutionId: vectorQuery.executionId,
            retrieval: {
              executionId: retrieval.executionId,
              contextId: retrieval.context.contextId,
              chunkCount: retrieval.context.chunkCount,
              totalTokens: retrieval.context.totalTokens,
              chunks: retrieval.context.chunks.map((chunk) => ({
                content: chunk.content,
                metadata: chunk.metadata,
              })),
            },
          };
        }

        const vectorStoreConnectionId = input.vectorStoreConnectionId ?? input.connectionId;
        if (!input.question?.trim()) {
          throw new Error("question is required for semantic retrieval.");
        }
        if (!input.embeddingConnectionId) {
          throw new Error("embeddingConnectionId is required for semantic retrieval.");
        }
        if (!vectorStoreConnectionId) {
          throw new Error("vectorStoreConnectionId or connectionId is required for semantic retrieval.");
        }

        const orchestrated = await deps.retrieval.orchestration.retrieveFromQuestion(
          asConversationContext(ctx),
          {
            companyId: input.companyId,
            question: input.question,
            embeddingConnectionId: input.embeddingConnectionId,
            vectorStoreConnectionId,
            collectionId: input.collectionId,
            correlationId: input.correlationId,
          },
        );

        return {
          vectorQueryExecutionId: orchestrated.vectorQueryExecutionId,
          retrieval: {
            executionId: orchestrated.executionId,
            contextId: orchestrated.context.contextId,
            chunkCount: orchestrated.context.chunkCount,
            totalTokens: orchestrated.context.totalTokens,
            chunks: orchestrated.context.chunks.map((chunk) => ({
              content: chunk.content,
              metadata: chunk.metadata,
            })),
          },
        };
      },
    },
    prompt: {
      async buildPrompt(ctx, input) {
        const runtime = requireEnterpriseRuntime(deps.execution);
        const built = await runtime.buildPrompt(asConversationContext(ctx), {
          companyId: input.companyId,
          conversationId: input.conversationId,
          templateType: "conversation",
          promptContext: {
            companyId: input.companyId,
            conversationId: input.conversationId,
            conversationState: input.conversationState,
            conversationSummary: null,
            recentMessages: input.recentMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            intentDecision: {
              intent_key: input.intent.intentKey,
              confidence: input.intent.confidence,
              matched_tool: input.intent.matchedTool,
              reason: input.intent.reason,
            },
            knowledge: mapRetrievalSnapshotToKnowledgeContext(input.retrieval),
            pageContext: input.pageContext,
          },
          recentMessages: input.recentMessages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
          conversationWindow: { maxMessages: 20, tokenBudget: 4096 },
        });

        if (!built.buildId) {
          throw new Error("Prompt build did not persist a build identifier.");
        }

        return {
          buildId: built.buildId,
          templateKey: built.templateKey,
          finalPrompt: built.finalPrompt,
        };
      },
    },
    execution: {
      async execute(ctx, input) {
        const runtime = requireEnterpriseRuntime(deps.execution);
        const result = await runtime.execute(asConversationContext(ctx), {
          companyId: input.companyId,
          conversationId: input.conversationId,
          promptBuildId: input.promptBuildId,
          providerConnectionId: input.providerConnectionId,
          policy: input.policy,
          stream: input.policy?.streaming,
          onStreamChunk: input.onStreamChunk,
          abortSignal: input.abortSignal,
          promptContext: {},
        });

        return {
          executionId: result.executionId,
          providerKey: result.providerKey,
          model: result.model,
          status: result.status,
          latencyMs: result.latencyMs,
          tokenUsage: {
            promptTokens: result.tokenUsage.prompt_tokens,
            completionTokens: result.tokenUsage.completion_tokens,
            totalTokens: result.tokenUsage.total_tokens,
          },
          responseContent: result.responseText,
        };
      },
    },
    provider: {
      async resolveProvider(ctx, input) {
        if (input.providerConnectionId) {
          const connection = await deps.provider.registry.getConnection(
            asConversationContext(ctx),
            input.providerConnectionId,
          );
          const providerKey = connection.ai_provider_definition?.key;
          if (!providerKey) {
            throw new Error("Provider definition is missing on the selected connection.");
          }
          return { providerKey, connectionId: connection.id };
        }

        const connections = await deps.provider.registry.listConnections(asConversationContext(ctx), {
          companyId: input.companyId,
        });
        const selected =
          connections.find((item) => item.is_default && item.is_enabled) ??
          connections.find((item) => item.is_enabled);
        if (!selected) {
          return { providerKey: "stub", connectionId: null };
        }
        const providerKey = selected.ai_provider_definition?.key;
        if (!providerKey) {
          throw new Error("Provider definition is missing on the default connection.");
        }
        return { providerKey, connectionId: selected.id };
      },
    },
  };
}

export function createRuntimeEnginePortsWithContext(
  deps: RuntimeEngineDependencies,
  ctx: ServiceContext,
  options: RuntimeEnginePortOptions = {},
): RuntimeEnginePorts {
  const base = createRuntimeEnginePorts(deps);
  const knowledgeRuntime = options.knowledgeRuntimeProvider;
  return {
    ...base,
    conversation: {
      ...base.conversation,
      async findConversation(conversationId) {
        const record = await deps.conversation.conversations.getConversation(
          asConversationContext(ctx),
          conversationId,
        );
        return {
          id: record.id,
          companyId: record.company_id,
          state: record.state,
          customerId: record.customer_id,
          channelType: record.channel_type,
          metadata: record.metadata ?? {},
        };
      },
      async listRecentMessages(conversationId, limit = 10) {
        const messages = await deps.conversation.messages.listMessages(asConversationContext(ctx), {
          conversationId,
          limit,
        });
        return messages.map((message) => ({
          id: message.id,
          role:
            message.message_type === "incoming"
              ? "customer"
              : message.message_type === "outgoing"
                ? "assistant"
                : "system",
          content: message.content,
          createdAt: message.created_at,
        }));
      },
    },
    retrieval: {
      ...base.retrieval,
      async runRetrieval(retrievalCtx, input) {
        if (input.queryVector || input.embeddingId) {
          return base.retrieval.runRetrieval(retrievalCtx, input);
        }

        if (!knowledgeRuntime) {
          throw new Error("knowledgeRuntimeProvider is required for semantic retrieval.");
        }

        const context = await knowledgeRuntime.retrieve(retrievalCtx, {
          companyId: input.companyId,
          question: input.question ?? "",
          collectionId: input.collectionId,
          embeddingConnectionId: input.embeddingConnectionId!,
          vectorStoreConnectionId: input.vectorStoreConnectionId ?? input.connectionId!,
          correlationId: input.correlationId,
          searchMode: "hybrid",
          rerank: true,
        });

        const snapshot = knowledgeRuntime.toRetrievalSnapshot(context);
        if (!snapshot) {
          return {
            vectorQueryExecutionId: context.vectorQueryExecutionId,
            retrieval: {
              executionId: context.executionId || "none",
              contextId: context.executionId || "none",
              chunkCount: 0,
              totalTokens: 0,
              chunks: [],
            },
          };
        }

        return {
          vectorQueryExecutionId: snapshot.vectorQueryExecutionId,
          retrieval: snapshot,
        };
      },
    },
    prompt: {
      ...base.prompt,
      async buildPrompt(promptCtx, input) {
        const runtime = requireEnterpriseRuntime(deps.execution);
        const conversationRecord = await deps.conversation.conversations.getConversation(
          asConversationContext(promptCtx),
          input.conversationId,
        );
        const senderHint = readSenderHint(conversationRecord.metadata ?? {}, input.pageContext);

        let customer360 = null;
        if (options.customer360Loader) {
          const actorUserId =
            promptCtx.userId ??
            (await options.resolveActorUserId?.(input.companyId)) ??
            "system";

          customer360 = await options.customer360Loader.load(
            {
              companyId: input.companyId,
              actorUserId,
              isSuperAdmin: promptCtx.isSuperAdmin,
              hasPermission: promptCtx.hasPermission,
            },
            {
              companyId: input.companyId,
              conversationId: input.conversationId,
              customerId: conversationRecord.customer_id,
              channelType: conversationRecord.channel_type,
              senderEmail: senderHint.senderEmail,
              senderPhone: senderHint.senderPhone,
              recentMessages: input.recentMessages.map((message) => ({
                role: message.role,
                content: message.content,
                createdAt: message.createdAt,
              })),
            },
          );
        }

        const built = await runtime.buildPrompt(asConversationContext(promptCtx), {
          companyId: input.companyId,
          conversationId: input.conversationId,
          templateType: "conversation",
          ...(options.promptMode === "dashboard"
            ? {
                orchestrationMode: "conversation" as const,
                currentUserMessage: input.messageText,
                toolsEnabled: true,
              }
            : {}),
          promptContext: {
            companyId: input.companyId,
            conversationId: input.conversationId,
            conversationState: input.conversationState,
            conversationSummary: null,
            recentMessages: input.recentMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
            intentDecision: {
              intent_key: input.intent.intentKey,
              confidence: input.intent.confidence,
              matched_tool: input.intent.matchedTool,
              reason: input.intent.reason,
            },
            knowledge: mapRetrievalSnapshotToKnowledgeContext(input.retrieval),
            ...(options.promptMode === "dashboard" && input.retrieval
              ? { systemInstructions: formatRetrievalInstructions(input.retrieval.chunks) }
              : {}),
            pageContext: input.pageContext,
            assembledContext: input.pageContext?.assembledContext,
            memorySnapshot: input.pageContext?.memorySnapshot,
            customer360: customer360 ?? input.pageContext?.assembledContext?.customer360 ?? undefined,
          },
          recentMessages: input.recentMessages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
          conversationWindow: { maxMessages: 20, tokenBudget: 4096 },
        });

        if (!built.buildId) {
          throw new Error("Prompt build did not persist a build identifier.");
        }

        return {
          buildId: built.buildId,
          templateKey: built.templateKey,
          finalPrompt: built.finalPrompt,
          ...(options.promptMode === "dashboard" && built.messagePlan
            ? { messagePlan: built.messagePlan }
            : {}),
        };
      },
    },
    execution: {
      ...base.execution,
      async execute(executionCtx, input) {
        const runtime = requireEnterpriseRuntime(deps.execution);
        const result = await runtime.execute(asConversationContext(executionCtx), {
          companyId: input.companyId,
          conversationId: input.conversationId,
          promptBuildId: input.promptBuildId,
          providerConnectionId: input.providerConnectionId,
          policy: input.policy,
          stream: input.policy?.streaming,
          onStreamChunk: input.onStreamChunk,
          abortSignal: input.abortSignal,
          ...(options.promptMode === "dashboard"
            ? {
                orchestrationMode: "conversation" as const,
                toolsEnabled: true,
              }
            : {}),
          promptContext: {},
        });

        return {
          executionId: result.executionId,
          providerKey: result.providerKey,
          model: result.model,
          status: result.status,
          latencyMs: result.latencyMs,
          tokenUsage: {
            promptTokens: result.tokenUsage.prompt_tokens,
            completionTokens: result.tokenUsage.completion_tokens,
            totalTokens: result.tokenUsage.total_tokens,
          },
          responseContent: result.responseText,
        };
      },
    },
  };
}
