import type { ValidationIssue, WorkflowDocument } from "../types";
import type { WorkflowValidationContext } from "./workflow-validation-context";

export type DocumentValidationExtension = (
  document: WorkflowDocument,
  context: WorkflowValidationContext,
) => ValidationIssue[];

const extensions: DocumentValidationExtension[] = [];

export function registerDocumentValidationExtension(extension: DocumentValidationExtension): void {
  extensions.push(extension);
}

export function validateDocumentExtensions(
  document: WorkflowDocument,
  context: WorkflowValidationContext = {},
): ValidationIssue[] {
  return extensions.flatMap((extension) => extension(document, context));
}

export function resetDocumentValidationExtensionsForTests(): void {
  extensions.length = 0;
}
