import type { WorkflowDocument } from "../../core/types";

function stableHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `wf-${Math.abs(hash).toString(36)}`;
}

export function computeWorkflowDocumentFingerprint(document: WorkflowDocument): string {
  const payload = {
    triggerType: document.triggerType,
    extensions: document.extensions ?? null,
    nodes: [...document.nodes]
      .map((node) => ({
        id: node.id,
        type: node.type,
        config: node.config,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...document.edges]
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        branchKey: edge.branchKey ?? null,
        branchLabel: edge.branchLabel ?? null,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };

  return stableHash(JSON.stringify(payload));
}

export function hasWorkflowDocumentDrift(
  sessionFingerprint: string | null | undefined,
  currentDocument: WorkflowDocument,
): boolean {
  if (!sessionFingerprint) return false;
  return sessionFingerprint !== computeWorkflowDocumentFingerprint(currentDocument);
}
