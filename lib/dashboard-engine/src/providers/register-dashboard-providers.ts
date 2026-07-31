import type { DashboardMetricRegistry } from "../dashboard-metric-registry.js";
import { createAiMetricsProvider } from "./ai-metrics-provider.js";
import { createAutomationMetricsProvider } from "./automation-metrics-provider.js";
import { createChannelsMetricsProvider } from "./channels-metrics-provider.js";
import { createCrmMetricsProvider } from "./crm-metrics-provider.js";
import { createKnowledgeMetricsProvider } from "./knowledge-metrics-provider.js";
import type { DashboardMetricsPorts } from "./ports/dashboard-metrics-ports.js";
import { createSupportMetricsProvider } from "./support-metrics-provider.js";

export function registerDashboardProviders(
  registry: DashboardMetricRegistry,
  ports: DashboardMetricsPorts,
): void {
  registry.registerProvider(createCrmMetricsProvider(ports.crm));
  registry.registerProvider(createSupportMetricsProvider(ports.support));
  registry.registerProvider(createAiMetricsProvider(ports.ai));
  registry.registerProvider(createAutomationMetricsProvider(ports.automation));
  registry.registerProvider(createKnowledgeMetricsProvider(ports.knowledge));
  registry.registerProvider(createChannelsMetricsProvider(ports.channels));
}

export const DEFAULT_DASHBOARD_PROVIDER_IDS = [
  "crm",
  "support",
  "ai",
  "automation",
  "knowledge",
  "channels",
] as const;
