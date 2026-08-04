import type { BusinessContextField, IntelligenceSnapshot } from "../types/intelligence-types.js";
import type {
  OperationsAiConfig,
  OperationsBusinessContextConfig,
  OperationsIntelligenceConfig,
} from "../types/extended-config-types.js";
import type { OperationsCustomer360WorkspaceData } from "../types/customer360-panel-types.js";
import { contextEngine } from "./context-engine.js";
import { operationalIntelligenceEngine } from "./operational-intelligence-engine.js";
import {
  createConfiguredAlertEngine,
  createConfiguredRecommendationEngine,
  createConfiguredWorkflowEngine,
  resolveCopilotCapabilities,
} from "./config-driven-intelligence.js";
import { OperationsRuntimeConfigurationError } from "../runtime/runtime-configuration-error.js";

function groupCommunications(ctx: OperationsCustomer360WorkspaceData) {
  const groups = new Map<string, typeof ctx.communications>();
  for (const item of ctx.communications) {
    const dateLabel = new Date(item.occurredAt).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const list = groups.get(dateLabel) ?? [];
    list.push(item);
    groups.set(dateLabel, list);
  }
  return Array.from(groups.entries()).map(([dateLabel, items]) => ({
    dateLabel,
    items: items.map((i) => ({
      id: i.id,
      channel: i.channel,
      preview: i.preview,
      occurredAt: i.occurredAt,
      actor: i.actor,
    })),
  }));
}

function resolveFieldValue(
  binding: OperationsBusinessContextConfig["fields"][number]["valueBinding"],
  staticValue: string | undefined,
  ctx: OperationsCustomer360WorkspaceData,
): string {
  if (binding === "customer.name") return ctx.customer.name;
  if (binding === "todaysOperation.assignedEmployee") return ctx.todaysOperation.assignedEmployee;
  return staticValue ?? "";
}

function buildBusinessContext(
  businessContext: OperationsBusinessContextConfig | undefined,
  ctx: OperationsCustomer360WorkspaceData,
): BusinessContextField[] {
  if (!businessContext?.fields?.length) {
    throw new OperationsRuntimeConfigurationError(
      "configuration.businessContext.fields is required — no runtime business context fallback available",
    );
  }
  return businessContext.fields.map((field) => ({
    key: field.key,
    label: field.label,
    icon: field.icon,
    value: resolveFieldValue(field.valueBinding, field.staticValue, ctx),
  }));
}

export class IntelligenceOrchestrator {
  buildSnapshot(
    ctx: OperationsCustomer360WorkspaceData,
    intelligence: OperationsIntelligenceConfig,
    businessContext: OperationsBusinessContextConfig,
    ai?: OperationsAiConfig,
  ): IntelligenceSnapshot {
    if ("isEmpty" in ctx && ctx.isEmpty) {
      throw new OperationsRuntimeConfigurationError("Cannot build intelligence snapshot without a selected customer");
    }

    const workflowEngine = createConfiguredWorkflowEngine(intelligence);
    const alertEngine = createConfiguredAlertEngine(intelligence);
    const recommendationEngine = createConfiguredRecommendationEngine(intelligence);
    const recommendations = recommendationEngine.generate(ctx);
    const topRec = recommendations[0];
    const currentJourneyStepId =
      businessContext.currentJourneyStepId ?? intelligence.journeySteps[intelligence.journeySteps.length - 1]?.id ?? "";

    return {
      journey: contextEngine.buildJourney(intelligence.journeySteps, currentJourneyStepId),
      workflow: workflowEngine.buildTracker(workflowEngine.resolveCurrentStageFromStatus(ctx.currentStatus)),
      alerts: alertEngine.evaluate(ctx),
      recommendations,
      operationalHealth: operationalIntelligenceEngine.buildHealthMetrics(),
      quickDecision: operationalIntelligenceEngine.buildQuickDecision(
        ctx,
        topRec?.title ?? "Review customer profile",
        topRec?.actionKey ?? "review",
      ),
      businessContext: buildBusinessContext(businessContext, ctx),
      miniKpis: operationalIntelligenceEngine.buildMiniKpis(ctx),
      copilotCapabilities: resolveCopilotCapabilities(ai),
      communicationGroups: groupCommunications(ctx),
    };
  }
}

export const intelligenceOrchestrator = new IntelligenceOrchestrator();
