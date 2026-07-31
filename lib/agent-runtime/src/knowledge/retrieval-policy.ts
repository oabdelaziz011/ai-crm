import type { AgentRetrievalPolicy, AgentTaskGraph } from "../types.js";

const KNOWLEDGE_TOOLS = new Set(["knowledge_search", "knowledge_lookup"]);

export function resolveRetrievalPolicy(graph: AgentTaskGraph): AgentRetrievalPolicy {
  if (graph.retrievalPolicy) return graph.retrievalPolicy;

  const hasKnowledgeTask = graph.nodes.some(
    (node) => node.tool != null && KNOWLEDGE_TOOLS.has(node.tool),
  );
  if (hasKnowledgeTask) return "required";

  if (/knowledge|onboarding|policy|faq|procedure|manual|documentation|document/i.test(graph.goal)) {
    return "optional";
  }

  return "disabled";
}

export function inferRetrievalQuery(goal: string, pageContext?: Record<string, unknown>): string {
  const fromContext = pageContext?.knowledgeQuery;
  if (typeof fromContext === "string" && fromContext.trim().length > 0) {
    return fromContext.trim();
  }
  return goal.trim();
}

export function isKnowledgeTool(toolKey: string | null | undefined): boolean {
  return toolKey != null && KNOWLEDGE_TOOLS.has(toolKey);
}

export function normalizeKnowledgeToolKey(toolKey: string): string {
  return toolKey === "knowledge_lookup" ? "knowledge_search" : toolKey;
}
