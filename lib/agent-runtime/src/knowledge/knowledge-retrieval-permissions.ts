import { AgentCrmToolPermissionDeniedError } from "../errors.js";
import type { ServiceContext } from "../types.js";
import {
  findMissingAlignedPermission,
  getAlignedCrmToolRequirements,
} from "../utils/crm-tool-permissions.js";

export const KNOWLEDGE_SEARCH_TOOL_KEY = "knowledge_search";

export async function assertKnowledgeRetrievalPermissions(
  ctx: ServiceContext,
  options?: {
    resolveRequiredPermissions?: (toolKey: string) => Promise<string[] | null | undefined>;
  },
): Promise<void> {
  const required =
    (await options?.resolveRequiredPermissions?.(KNOWLEDGE_SEARCH_TOOL_KEY)) ??
    getAlignedCrmToolRequirements(KNOWLEDGE_SEARCH_TOOL_KEY);

  if (!required?.length) return;

  const missing = findMissingAlignedPermission(ctx, required, KNOWLEDGE_SEARCH_TOOL_KEY);
  if (missing) {
    throw new AgentCrmToolPermissionDeniedError(KNOWLEDGE_SEARCH_TOOL_KEY, missing);
  }
}
