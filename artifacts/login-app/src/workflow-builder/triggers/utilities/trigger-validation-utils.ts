import type { ValidationIssue, WorkflowDocument } from "../../core/types";
import type { WorkflowValidationContext } from "../../core/validation/workflow-validation-context";
import {
  getTriggerCatalogEntry,
  resolveDefaultTriggerConfiguration,
} from "../adapters/trigger-registry-adapter";
import { hasChannelBinding } from "./trigger-channel-binding-utils";

export function collectTriggerValidationIssues(
  document: WorkflowDocument,
  context: WorkflowValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const config = resolveDefaultTriggerConfiguration(document);
  const entry = getTriggerCatalogEntry(config.catalogId);

  if (entry.classification === "configuration_only") {
    issues.push({
      id: "trigger-configuration-only",
      message: "This trigger type is configuration only — runtime execution is not available yet.",
      severity: "warning",
      fieldLabelKey: "workflowBuilder.triggers.validation.configurationOnly",
    });
  }

  if (entry.requiresChannelBinding) {
    if (context.channelBindings !== undefined) {
      if (!hasChannelBinding(context.channelBindings, config.channel ?? entry.channel)) {
        issues.push({
          id: "trigger-missing-channel-binding",
          message: "Connect this workflow to a channel before it can receive messages.",
          severity: "error",
          fieldLabelKey: "workflowBuilder.triggers.validation.missingChannelBinding",
        });
      }
    }
  }

  if (config.catalogId === "schedule" && !config.cronExpression?.trim()) {
    issues.push({
      id: "trigger-missing-cron",
      message: "Add a cron expression for the schedule trigger.",
      severity: "error",
      fieldLabelKey: "workflowBuilder.triggers.validation.missingCron",
    });
  }

  if (config.catalogId === "webhook" && !config.webhookPath?.trim()) {
    issues.push({
      id: "trigger-missing-webhook-path",
      message: "Add a webhook path for this trigger.",
      severity: "error",
      fieldLabelKey: "workflowBuilder.triggers.validation.missingWebhookPath",
    });
  }

  if (config.catalogId === "custom_event" && !config.customEventName?.trim()) {
    issues.push({
      id: "trigger-missing-custom-event",
      message: "Provide a custom event name.",
      severity: "error",
      fieldLabelKey: "workflowBuilder.triggers.validation.missingCustomEvent",
    });
  }

  if (config.catalogId === "rest_api" && !config.apiAuthHint?.trim()) {
    issues.push({
      id: "trigger-missing-api-auth",
      message: "Document how callers authenticate to this API trigger.",
      severity: "warning",
      fieldLabelKey: "workflowBuilder.triggers.validation.missingApiAuth",
    });
  }

  return issues;
}

export function collectTriggerReadinessFactors(input: {
  document: WorkflowDocument;
  bindings: ReadonlyArray<{ channel: string | null; isEnabled: boolean }>;
  canEdit: boolean;
  canTest: boolean;
  hasExecutionHistory: boolean;
  validationIssues: ValidationIssue[];
}) {
  const config = resolveDefaultTriggerConfiguration(input.document);
  const entry = getTriggerCatalogEntry(config.catalogId);

  const factors = [
    {
      id: "configuration",
      labelKey: "workflowBuilder.triggers.readiness.configuration",
      satisfied: input.validationIssues.every((issue) => issue.severity !== "error"),
      severity: "error" as const,
    },
    {
      id: "runtime",
      labelKey:
        entry.classification === "configuration_only"
          ? "workflowBuilder.triggers.readiness.runtimeConfigurationOnly"
          : "workflowBuilder.triggers.readiness.runtimeExecutable",
      satisfied: entry.classification === "executable",
      severity: entry.classification === "configuration_only" ? ("warning" as const) : ("info" as const),
    },
    {
      id: "channelBinding",
      labelKey: "workflowBuilder.triggers.readiness.channelBinding",
      satisfied:
        !entry.requiresChannelBinding ||
        hasChannelBinding(input.bindings, config.channel ?? entry.channel),
      severity: "error" as const,
    },
    {
      id: "permissions",
      labelKey: "workflowBuilder.triggers.readiness.permissions",
      satisfied: input.canEdit,
      severity: "warning" as const,
    },
    {
      id: "testing",
      labelKey: "workflowBuilder.triggers.readiness.testing",
      satisfied: input.canTest,
      severity: "info" as const,
    },
  ];

  if (input.hasExecutionHistory) {
    factors.push({
      id: "history",
      labelKey: "workflowBuilder.triggers.readiness.history",
      satisfied: true,
      severity: "info" as const,
    });
  }

  const satisfiedCount = factors.filter((factor) => factor.satisfied).length;
  const rawScore = Math.round((satisfiedCount / factors.length) * 100);
  const score =
    entry.classification === "configuration_only" ? Math.min(rawScore, 75) : rawScore;

  return {
    score,
    classification: entry.classification,
    factors,
  };
}

export function resolveTriggerSourceLabel(
  config: { catalogId: string; customEventName?: string; channel?: string },
  businessEvent: string | null | undefined,
): string {
  if (config.customEventName?.trim()) return config.customEventName.trim();
  if (businessEvent) return businessEvent;
  if (config.channel) return `${config.channel}.inbound`;
  return config.catalogId;
}
