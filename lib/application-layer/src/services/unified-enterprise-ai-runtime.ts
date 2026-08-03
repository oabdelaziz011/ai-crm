import type { ApplicationContext } from "../contracts/application-context.js";
import type {
  EnterpriseRuntimeCoordinatorPort,
  EnterpriseRuntimeInternalPort,
  UnifiedRuntimeExecuteRequest,
  UnifiedRuntimeExecuteResponse,
  UnifiedRuntimeServiceContext,
} from "../ports/ai-runtime-port.js";
import type { RuntimeContextCache } from "../cache/runtime-context-cache.js";
import { createRuntimeContextCache } from "../cache/runtime-context-cache.js";
import { ContextAssemblyService, type ContextAssemblyRequest } from "./context-assembly-service.js";
import { UnifiedMemoryPipeline } from "./unified-memory-pipeline.js";
import type { ApplicationLayerDeps } from "./application-services.js";

export type UnifiedEnterpriseAIRuntimeDeps = Readonly<{
  coordinator: EnterpriseRuntimeCoordinatorPort;
  contextAssembly: ContextAssemblyService;
  memoryPipeline?: UnifiedMemoryPipeline;
  contextCache?: RuntimeContextCache;
}>;

/**
 * Unified enterprise AI runtime — single orchestration pipeline.
 * Provider selection, context assembly, memory, caching, and coordinator dispatch.
 */
export class UnifiedEnterpriseAIRuntime {
  private readonly memoryPipeline: UnifiedMemoryPipeline;
  private readonly contextCache: RuntimeContextCache;

  constructor(private readonly deps: UnifiedEnterpriseAIRuntimeDeps) {
    this.memoryPipeline = deps.memoryPipeline ?? new UnifiedMemoryPipeline();
    this.contextCache = deps.contextCache ?? createRuntimeContextCache();
  }

  static fromApplicationDeps(
    appDeps: ApplicationLayerDeps,
    coordinator: EnterpriseRuntimeCoordinatorPort,
  ): UnifiedEnterpriseAIRuntime {
    return new UnifiedEnterpriseAIRuntime({
      coordinator,
      contextAssembly: new ContextAssemblyService(appDeps),
    });
  }

  async execute(
    runtimeCtx: UnifiedRuntimeServiceContext,
    appCtx: ApplicationContext,
    request: UnifiedRuntimeExecuteRequest,
  ): Promise<UnifiedRuntimeExecuteResponse> {
    const cacheKey = this.contextCache.buildKey({
      tenantId: request.companyId,
      conversationId: request.conversationId,
    });

    let contextCacheHit = false;
    let enrichedPageContext = { ...(request.pageContext ?? {}) };

    const cached = await this.contextCache.getContext(cacheKey);
    if (cached) {
      contextCacheHit = true;
      enrichedPageContext = {
        ...enrichedPageContext,
        assembledContext: cached.assembled,
        memorySnapshot: cached.memory,
      };
    } else {
      const assemblyRequest = this.buildAssemblyRequest(request);
      const assembled = await this.deps.contextAssembly.assemble(assemblyRequest, appCtx);
      const memory = this.memoryPipeline.load(
        {
          conversationId: request.conversationId,
          correlationId: appCtx.correlationId,
          assembled: assembled.data,
          recentMessages: this.readRecentMessages(request.pageContext),
        },
        appCtx,
      );

      enrichedPageContext = {
        ...enrichedPageContext,
        assembledContext: assembled.data,
        memorySnapshot: memory,
      };

      await this.contextCache.setContext(cacheKey, {
        assembled: assembled.data,
        memory,
        cachedAt: new Date().toISOString(),
      });
    }

    const response = await this.deps.coordinator.execute(runtimeCtx, {
      ...request,
      pageContext: enrichedPageContext,
    });

    return Object.freeze({
      runtimeId: response.runtimeId,
      executionId: response.executionId,
      correlationId: response.correlationId,
      executionTimeMs: response.executionTimeMs,
      intentKey: response.intentKey,
      providerKey: response.providerKey,
      responseContent: response.responseContent,
      tokenUsage: response.tokenUsage,
      contextCacheHit,
    });
  }

  /** Exposes internal enterprise runtime for workflow nodes — still behind unified entry. */
  getInternalRuntime(internal: EnterpriseRuntimeInternalPort): EnterpriseRuntimeInternalPort {
    return internal;
  }

  invalidateContext(tenantId: string, conversationId?: string): Promise<void> {
    if (conversationId) {
      return this.contextCache.invalidateContext(
        this.contextCache.buildKey({ tenantId, conversationId }),
      );
    }
    return this.contextCache.invalidateTenant(tenantId);
  }

  private buildAssemblyRequest(request: UnifiedRuntimeExecuteRequest): ContextAssemblyRequest {
    const page = request.pageContext ?? {};
    const hints = request.contextHints ?? {};
    return Object.freeze({
      customerId: hints.customerId ?? (typeof page.customerId === "string" ? page.customerId : undefined),
      leadId: hints.leadId ?? (typeof page.leadId === "string" ? page.leadId : undefined),
      bookingId: hints.bookingId ?? (typeof page.bookingId === "string" ? page.bookingId : undefined),
      invoiceId: hints.invoiceId ?? (typeof page.invoiceId === "string" ? page.invoiceId : undefined),
      conversationId: request.conversationId,
      knowledgeQuery: hints.knowledgeQuery ?? request.messageText,
      includeWorkspace: true,
      includeCompany: true,
      includeFeatureFlags: true,
      includeLicensing: true,
      includeConfiguration: true,
    });
  }

  private readRecentMessages(pageContext?: Record<string, unknown>) {
    const messages = pageContext?.recentMessages;
    if (!Array.isArray(messages)) return undefined;
    return messages
      .filter((m): m is { role: string; content: string } =>
        typeof m === "object" && m !== null && "role" in m && "content" in m,
      )
      .map((m) => ({ role: String(m.role), content: String(m.content) }));
  }
}
