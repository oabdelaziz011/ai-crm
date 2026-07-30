import type { AIWorkflowExecutionAdapter } from "./adapters/ai-workflow-execution-adapter.js";
import { createAIWorkflowExecutionAdapter } from "./adapters/ai-workflow-execution-adapter.js";
import type { EnterpriseRuntimeLike } from "./adapters/ai-workflow-execution-adapter.js";
import { AIWorkflowPreviewService, AIWorkflowValidator } from "./preview/ai-workflow-preview-service.js";
import {
  createDefaultAIWorkflowRegistries,
  type AIWorkflowRegistryBundle,
} from "./registries/index.js";
import { registerBuiltInAIWorkflowNodes } from "./register-built-in-ai-nodes.js";
import { AIWorkflowNodeExecutor } from "./runtime/ai-workflow-node-executor.js";
import {
  createAIWorkflowRuntimeBridge,
  wrapActionHandlerWithAIWorkflow,
} from "./runtime/ai-workflow-runtime-bridge.js";
import { AIWorkflowObservability } from "./observability/ai-workflow-observability.js";
import type { BaseAIWorkflowNode } from "./nodes/base-ai-workflow-node.js";

export type AIWorkflowPlatformServices = {
  registries: AIWorkflowRegistryBundle;
  adapter: AIWorkflowExecutionAdapter;
  executor: AIWorkflowNodeExecutor;
  preview: AIWorkflowPreviewService;
  validator: AIWorkflowValidator;
  observability: AIWorkflowObservability;
  nodes: Map<string, BaseAIWorkflowNode>;
  createRuntimeBridge: (
    resolveServiceContext: (ctx: import("./types/automation-context.js").AIWorkflowAutomationContext) => import("./adapters/ai-workflow-execution-adapter.js").AIWorkflowServiceContext,
  ) => ReturnType<typeof createAIWorkflowRuntimeBridge>;
  wrapActionHandler: typeof wrapActionHandlerWithAIWorkflow;
};

export type CreateAIWorkflowPlatformOptions = {
  runtime: EnterpriseRuntimeLike;
  knowledge?: import("./adapters/knowledge-retrieval-port.js").AIWorkflowKnowledgeRetrievalPort;
  registries?: AIWorkflowRegistryBundle;
  registerBuiltIns?: boolean;
};

export function createAIWorkflowPlatformServices(
  options: CreateAIWorkflowPlatformOptions,
): AIWorkflowPlatformServices {
  const registries = options.registries ?? createDefaultAIWorkflowRegistries();
  const nodes =
    options.registerBuiltIns === false ? new Map<string, BaseAIWorkflowNode>() : registerBuiltInAIWorkflowNodes(registries);
  const observability = new AIWorkflowObservability();
  const adapter = createAIWorkflowExecutionAdapter(options.runtime);
  const executor = new AIWorkflowNodeExecutor({
    registries,
    adapter,
    knowledge: options.knowledge,
    nodes,
    observability,
  });
  const preview = new AIWorkflowPreviewService(registries, nodes);
  const validator = new AIWorkflowValidator(registries, nodes);

  return {
    registries,
    adapter,
    executor,
    preview,
    validator,
    observability,
    nodes,
    createRuntimeBridge: (resolveServiceContext) =>
      createAIWorkflowRuntimeBridge({
        registries,
        adapter,
        resolveServiceContext,
        executor,
      }),
    wrapActionHandler: wrapActionHandlerWithAIWorkflow,
  };
}

export * from "./utils/workflow-guards.js";
export { AI_WORKFLOW_ACTION, AI_WORKFLOW_FRAMEWORK_VERSION } from "./constants.js";
export * from "./constants.js";
export * from "./types/configuration.js";
export * from "./types/metadata.js";
export * from "./types/preview.js";
export * from "./types/validation.js";
export * from "./registries/index.js";
export * from "./registries/output-mapper-registry.js";
export * from "./registries/ai-node-registry.js";
export * from "./registries/capability-registry.js";
export * from "./registries/configuration-registry.js";
export * from "./registries/validation-registry.js";
export * from "./adapters/ai-workflow-execution-adapter.js";
export * from "./nodes/base-ai-workflow-node.js";
export * from "./runtime/ai-workflow-node-executor.js";
export * from "./types/automation-context.js";
export * from "./runtime/ai-workflow-runtime-bridge.js";
export * from "./preview/ai-workflow-preview-service.js";
export * from "./observability/ai-workflow-observability.js";
export * from "./register-built-in-ai-nodes.js";
export * from "./nodes/summarizer/summarizer-node.js";
export * from "./nodes/summarizer/constants.js";
export * from "./nodes/summarizer/types.js";
export * from "./nodes/summarizer/summarizer-presets.js";
export * from "./nodes/summarizer/summarizer-validation.js";
export * from "./nodes/extract/extract-node.js";
export * from "./nodes/extract/constants.js";
export * from "./nodes/extract/types.js";
export * from "./nodes/extract/extract-presets.js";
export * from "./nodes/extract/schema-validation.js";
export * from "./nodes/extract/result-validator.js";
export * from "./nodes/decision/decision-node.js";
export * from "./nodes/decision/constants.js";
export * from "./nodes/decision/types.js";
export * from "./nodes/decision/decision-presets.js";
export * from "./adapters/knowledge-retrieval-port.js";
export * from "./nodes/decision/decision-validation.js";
export * from "./nodes/decision/result-validator.js";
export * from "./nodes/knowledge-search/knowledge-search-node.js";
export * from "./nodes/knowledge-search/constants.js";
export * from "./nodes/knowledge-search/types.js";
export * from "./nodes/knowledge-search/knowledge-search-presets.js";
export * from "./nodes/knowledge-search/knowledge-search-validation.js";
export * from "./nodes/knowledge-search/result-mapper.js";
