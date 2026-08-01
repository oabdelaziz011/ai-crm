import type { WorkflowDocument } from "../../core/types";
import type { WorkflowValidationContext } from "../../core/validation/workflow-validation-context";
import {
  applyCatalogSelection,
  resolveDefaultTriggerConfiguration,
} from "../adapters/trigger-registry-adapter";
import type { TriggerAnalyticsModel, TriggerCatalogId, TriggerConfiguration } from "../types/trigger-types";
import { buildTriggerPreviewModel, buildTriggerReadinessModel, buildTriggerTestModel } from "../selectors/trigger-selectors";
import type { ChannelBindingSnapshot } from "../utilities/trigger-channel-binding-utils";
import { toValidationChannelBindings } from "../utilities/trigger-channel-binding-utils";
import { mergeTriggerConfigPatch } from "../utilities/trigger-config-utils";
import { collectTriggerValidationIssues } from "../utilities/trigger-validation-utils";
import { validateWorkflow } from "../../core/validation/workflow-validator";

export class TriggerConfigurationService {
  resolveConfiguration(document: WorkflowDocument): TriggerConfiguration {
    return resolveDefaultTriggerConfiguration(document);
  }

  applyCatalogSelection(catalogId: TriggerCatalogId): {
    triggerType: WorkflowDocument["triggerType"];
    triggerConfig: TriggerConfiguration;
  } {
    return applyCatalogSelection(catalogId);
  }

  validate(document: WorkflowDocument, bindings: ReadonlyArray<ChannelBindingSnapshot> = []) {
    const context: WorkflowValidationContext = {
      channelBindings: toValidationChannelBindings(bindings),
    };
    return collectTriggerValidationIssues(document, context);
  }

  validateWorkflow(document: WorkflowDocument, bindings: ReadonlyArray<ChannelBindingSnapshot> = []) {
    const context: WorkflowValidationContext = {
      channelBindings: toValidationChannelBindings(bindings),
    };
    return validateWorkflow(document, context);
  }

  preview(document: WorkflowDocument) {
    return buildTriggerPreviewModel(document);
  }

  readiness(
    document: WorkflowDocument,
    bindings: ReadonlyArray<ChannelBindingSnapshot>,
    canEdit: boolean,
    canTest: boolean,
    analytics?: TriggerAnalyticsModel,
  ) {
    return buildTriggerReadinessModel(document, bindings, canEdit, canTest, analytics);
  }

  testPayload(document: WorkflowDocument) {
    return buildTriggerTestModel(document);
  }
}

export { mergeTriggerConfigPatch };
