import { nestedSectionHref } from "@/lib/routing";

/** Dashboard-nest path for the AI Employees section entry. */
export const AGENTS_NESTED_PATH = "/agents";

/**
 * Paths below are relative to the Agents nest (`Route path="/agents" nest`).
 * Do not prefix `/agents` again inside AgentsLayout — that doubles the segment.
 */

export function agentDetailHref(agentId: string): string {
  return nestedSectionHref(agentId);
}

export function agentEditHref(agentId: string): string {
  return nestedSectionHref(`${agentId}/edit`);
}

export function agentNewHref(): string {
  return nestedSectionHref("/new");
}

/** Resume an in-progress create wizard draft (nest-relative). */
export function agentContinueHref(draftId: string): string {
  return nestedSectionHref(`/new?draft=${encodeURIComponent(draftId)}`);
}

/** Use from outside the Agents nest (e.g. Omnichannel → employee). */
export function agentDetailDashboardHref(agentId: string): string {
  return nestedSectionHref(`${AGENTS_NESTED_PATH}/${agentId}`);
}
