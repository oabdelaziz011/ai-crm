import type { DashboardSectionId } from "@/config/dashboard-route-registry";

const AI_DASHBOARD_SECTIONS = new Set<DashboardSectionId>([
  "ai-assistant",
  "ai-chat",
  "ai-runtime",
  "ai-usage",
  "ai-analytics",
  "prompts",
  "knowledge",
  "automation",
  "omnichannel",
  "channels",
]);

export function isAiDashboardSection(sectionId: DashboardSectionId | null): boolean {
  if (!sectionId) return false;
  return AI_DASHBOARD_SECTIONS.has(sectionId);
}
