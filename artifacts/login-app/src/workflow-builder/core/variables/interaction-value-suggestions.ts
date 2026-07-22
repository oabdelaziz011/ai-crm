import {
  collectContextInteractionTypes,
  collectContextInteractiveOptions,
} from "../graph/upstream-interactive-nodes";
import { getInteractionValueSuggestionKind } from "./interaction-variables";
import type { WorkflowDocument } from "../types";

export type InteractionSuggestion = {
  key: string;
  value: string;
  label: string;
};

export function buildInteractionSuggestions(
  field: string,
  document: WorkflowDocument,
  nodeId: string,
  typeLabel: (type: string) => string = (type) => type,
): InteractionSuggestion[] {
  const kind = getInteractionValueSuggestionKind(field);
  if (!kind) return [];

  if (kind === "id" || kind === "label") {
    const options = collectContextInteractiveOptions(document, nodeId);
    if (options.length === 0) return [];

    if (kind === "id") {
      return options.map((option) => ({
        key: `${option.sourceNodeId}:${option.id}:id`,
        value: option.id,
        label: option.label !== option.id ? `${option.label} (${option.id})` : option.id,
      }));
    }

    const labelCounts = new Map<string, number>();
    for (const option of options) {
      labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
    }

    return options.map((option) => ({
      key: `${option.sourceNodeId}:${option.id}:label`,
      value: option.label,
      label:
        (labelCounts.get(option.label) ?? 0) > 1 ? `${option.label} (${option.id})` : option.label,
    }));
  }

  return collectContextInteractionTypes(document, nodeId).map((type) => ({
    key: type,
    value: type,
    label: typeLabel(type),
  }));
}

export function shouldUseInteractionSuggestions(
  field: string,
  document: WorkflowDocument | undefined,
  nodeId: string | undefined,
): boolean {
  if (!document || !nodeId) return false;
  return buildInteractionSuggestions(field, document, nodeId).length > 0;
}
