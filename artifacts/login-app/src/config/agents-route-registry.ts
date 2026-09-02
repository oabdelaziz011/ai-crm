import { nestedSectionHref } from "@/lib/routing";
import type { AgentConfigurationTabId } from "@/lib/ai-employees/components/configuration/agent-configuration-workspace";

/** Dashboard-nest path for the AI Employees section entry. */
export const AGENTS_NESTED_PATH = "/agents";

/**
 * Paths below are relative to the Agents nest (`Route path="/agents" nest`).
 * Do not prefix `/agents` again inside AgentsLayout — that doubles the segment.
 */

export type AgentDetailHrefOptions = {
  /** Genuine read-only Control Center view — forces no mutations. */
  mode?: "view";
  tab?: "overview" | "setup" | "channels" | "knowledge" | "lifecycle" | "activity";
  /** Nested setup config tab (tools = employee tool permissions). */
  config?: AgentConfigurationTabId;
};

function withDetailQuery(agentId: string, options?: AgentDetailHrefOptions): string {
  const base = nestedSectionHref(agentId);
  if (!options) return base;
  const params = new URLSearchParams();
  if (options.mode === "view") params.set("mode", "view");
  if (options.tab && options.tab !== "overview") params.set("tab", options.tab);
  if (options.config) params.set("config", options.config);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function agentDetailHref(agentId: string, options?: AgentDetailHrefOptions): string {
  return withDetailQuery(agentId, options);
}

/** View Details — Control Center read-only mode. */
export function agentViewDetailsHref(agentId: string): string {
  return withDetailQuery(agentId, { mode: "view" });
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

/** Reuse existing Channels tab — does not change channel:* binding semantics. */
export function agentManageChannelsHref(agentId: string): string {
  return withDetailQuery(agentId, { tab: "channels" });
}

/**
 * AI Employee capabilities & tool access (allowed tools / scope).
 * Not human RBAC (agents.*) — deep-links Setup → Tools.
 */
export function agentManageCapabilitiesHref(agentId: string): string {
  return withDetailQuery(agentId, { tab: "setup", config: "tools" });
}

/** @deprecated Use agentManageCapabilitiesHref — kept for call-site migration safety. */
export function agentManagePermissionsHref(agentId: string): string {
  return agentManageCapabilitiesHref(agentId);
}

/** Lifecycle Publish / Disable / Restore — existing lifecycle panel only. */
export function agentLifecycleHref(agentId: string): string {
  return withDetailQuery(agentId, { tab: "lifecycle" });
}

/** Use from outside the Agents nest (e.g. Omnichannel → employee). */
export function agentDetailDashboardHref(agentId: string): string {
  return nestedSectionHref(`${AGENTS_NESTED_PATH}/${agentId}`);
}
