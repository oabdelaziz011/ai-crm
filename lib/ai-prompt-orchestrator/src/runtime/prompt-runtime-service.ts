import { PROMPT_PERMISSIONS } from "../constants.js";
import { PermissionDeniedError, ValidationError } from "../errors.js";
import type { PromptComposer } from "../composition/prompt-composer.js";
import type { PromptMetadataTracker } from "../metadata/prompt-metadata-tracker.js";
import type { PromptPolicyRegistry } from "../policies/prompt-policy.js";
import type { PromptRenderer } from "../rendering/prompt-renderer.js";
import type { PromptOrchestratorService } from "../services/prompt-orchestrator-service.js";
import type { PromptValidator } from "../validation/prompt-validator.js";
import type { BuildPromptInput, BuiltPrompt, ServiceContext } from "../types.js";

export type PromptGatewayPort = {
  chatCompletion(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model?: string;
    providerKey?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ text: string; model: string; providerKey: string }>;
};

export type PromptRuntimeExecuteInput = BuildPromptInput & {
  providerKey?: string;
  model?: string;
  policyKey?: string;
  invokeGateway?: boolean;
};

export type PromptRuntimeExecuteResult = {
  builtPrompt: BuiltPrompt;
  gatewayResponse?: { text: string; model: string; providerKey: string };
};

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) throw new PermissionDeniedError(permission);
}

export class PromptRuntimeService {
  constructor(
    private readonly deps: {
      orchestrator: PromptOrchestratorService;
      renderer: PromptRenderer;
      validator: PromptValidator;
      composer: PromptComposer;
      policies: PromptPolicyRegistry;
      metadata: PromptMetadataTracker;
      gateway?: PromptGatewayPort;
    },
  ) {}

  async execute(ctx: ServiceContext, input: PromptRuntimeExecuteInput): Promise<PromptRuntimeExecuteResult> {
    assertPermission(ctx, PROMPT_PERMISSIONS.view);
    const started = Date.now();
    const builtPrompt = await this.deps.orchestrator.build(ctx, input);
    const executionTimeMs = Date.now() - started;

    const policy = this.deps.policies.resolve(input.policyKey);
    const policyIssues = this.deps.policies.validateExecution(policy, {
      providerKey: input.providerKey,
      model: input.model,
    });
    if (policyIssues.length > 0) {
      throw new ValidationError(policyIssues.join(" "));
    }

    builtPrompt.metadata = {
      renderedSize: builtPrompt.final_prompt.length,
      variableCount: this.deps.renderer.extractVariables(builtPrompt.final_prompt).length,
      estimatedTokens: Math.max(1, Math.ceil(builtPrompt.final_prompt.length / 4)),
      executionTimeMs,
    };

    this.deps.metadata.record({
      promptId: builtPrompt.template_key,
      versionId: builtPrompt.template_version_id,
      versionLabel: builtPrompt.template_version_id,
      providerKey: input.providerKey,
      model: input.model,
      renderedSize: builtPrompt.metadata.renderedSize,
      variableCount: builtPrompt.metadata.variableCount,
      executionTimeMs,
      renderedText: builtPrompt.final_prompt,
    });

    let gatewayResponse: PromptRuntimeExecuteResult["gatewayResponse"];
    if (input.invokeGateway && this.deps.gateway) {
      gatewayResponse = await this.deps.gateway.chatCompletion({
        messages: [{ role: "user", content: builtPrompt.final_prompt }],
        model: input.model ?? policy.allowedModels?.[0],
        providerKey: input.providerKey ?? policy.allowedProviders?.[0],
        temperature: policy.temperature,
        maxTokens: policy.maxTokens,
      });
    }

    return { builtPrompt, gatewayResponse };
  }
}
