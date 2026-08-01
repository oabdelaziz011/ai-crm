import type { WorkflowDocument } from "../../core/types";
import type { WorkflowValidationContext } from "../../core/validation/workflow-validation-context";
import { collectTriggerValidationIssues } from "../utilities/trigger-validation-utils";

export function createTriggerValidationExtension() {
  return (document: WorkflowDocument, context: WorkflowValidationContext) =>
    collectTriggerValidationIssues(document, context);
}
