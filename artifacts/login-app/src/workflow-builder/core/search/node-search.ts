import type { WorkflowNodeDefinition } from "../node-registry";

export function searchWorkflowNodes(query: string, nodes: WorkflowNodeDefinition[] = []): WorkflowNodeDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  return nodes.filter((node) => scoreNode(node, normalized) > 0).sort((a, b) => scoreNode(b, normalized) - scoreNode(a, normalized));
}

function scoreNode(node: WorkflowNodeDefinition, query: string): number {
  const haystacks = [
    node.displayName,
    node.description,
    node.id.replace(/_/g, " "),
    node.category,
    ...(node.searchKeywords ?? []),
  ].map((value) => value.toLowerCase());

  let score = 0;
  for (const haystack of haystacks) {
    if (haystack === query) score += 100;
    else if (haystack.startsWith(query)) score += 50;
    else if (haystack.includes(query)) score += 20;
  }
  return score;
}
