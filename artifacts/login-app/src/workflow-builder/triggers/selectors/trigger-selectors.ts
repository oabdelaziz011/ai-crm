import type { WorkflowDocument } from "../../core/types";
import { listAllWorkflowVariables } from "../../core/variables/variable-provider-registry";
import {
  getTriggerCatalogEntry,
  resolveDefaultTriggerConfiguration,
} from "../adapters/trigger-registry-adapter";
import type {
  TriggerAnalyticsModel,
  TriggerPreviewModel,
  TriggerReadinessModel,
} from "../types/trigger-types";
import type { ChannelBindingSnapshot } from "../utilities/trigger-channel-binding-utils";
import {
  collectTriggerReadinessFactors,
  collectTriggerValidationIssues,
  resolveTriggerSourceLabel,
} from "../utilities/trigger-validation-utils";
import { buildTriggerPreviewPayload } from "../utilities/trigger-preview-utils";
import { buildTriggerTestPayload } from "../utilities/trigger-test-payload-utils";

export function buildTriggerPreviewModel(document: WorkflowDocument): TriggerPreviewModel {
  const config = resolveDefaultTriggerConfiguration(document);
  const entry = getTriggerCatalogEntry(config.catalogId);
  const payload = buildTriggerPreviewPayload(document, config, entry);

  return {
    catalogId: config.catalogId,
    classification: entry.classification,
    platformTriggerType: document.triggerType,
    source: resolveTriggerSourceLabel(config, entry.businessEvent),
    channel: config.channel ?? entry.channel ?? null,
    payload,
    metadata: {
      triggerType: document.triggerType,
      catalogId: config.catalogId,
      legacyTriggerType: config.legacyTriggerType ?? null,
      businessEvent: config.businessEvent ?? null,
      customEventName: config.customEventName ?? null,
      cronExpression: config.cronExpression ?? null,
      webhookPath: config.webhookPath ?? null,
    },
    variables: listAllWorkflowVariables().map((variable) => ({
      token: variable.token,
      label: variable.label,
      previewValue: variable.previewValue,
    })),
  };
}

export function buildTriggerReadinessModel(
  document: WorkflowDocument,
  bindings: ReadonlyArray<ChannelBindingSnapshot>,
  canEdit: boolean,
  canTest: boolean,
  analytics?: TriggerAnalyticsModel,
): TriggerReadinessModel {
  const validationIssues = collectTriggerValidationIssues(document, {
    channelBindings: bindings,
  });

  return collectTriggerReadinessFactors({
    document,
    bindings,
    canEdit,
    canTest,
    hasExecutionHistory: Boolean(analytics && analytics.executions > 0),
    validationIssues,
  });
}

export function buildTriggerTestModel(document: WorkflowDocument) {
  const config = resolveDefaultTriggerConfiguration(document);
  const entry = getTriggerCatalogEntry(config.catalogId);
  return buildTriggerTestPayload(document, config, entry);
}
