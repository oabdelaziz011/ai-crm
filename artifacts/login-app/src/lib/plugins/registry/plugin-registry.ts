import type { ExtensionPoint, PluginCatalogEntry, PluginWidgetContribution } from "@/lib/plugins/types";

/** Built-in extension point registry — plugins register against these. */
export const EXTENSION_POINTS: ExtensionPoint[] = [
  "crm.customer.profile",
  "scheduling.booking.form",
  "billing.invoice.detail",
  "communication.template",
  "executive.dashboard",
  "organization.branch",
  "portal.booking",
  "dashboard.widget",
  "navigation.sidebar",
  "settings.page",
  "workflow.event",
  "automation.trigger",
];

export const BUILTIN_WIDGETS: PluginWidgetContribution[] = [
  { pluginId: "valueor.booking-insights", widgetId: "booking-insights", title: "Booking Insights", category: "scheduling", renderKey: "valueor.booking-insights" },
  { pluginId: "valueor.revenue-summary", widgetId: "revenue-summary", title: "Revenue Summary", category: "billing", renderKey: "valueor.revenue-summary" },
  { pluginId: "valueor.branch-health", widgetId: "branch-health", title: "Branch Health", category: "organization", renderKey: "valueor.branch-health" },
  { pluginId: "valueor.communication-digest", widgetId: "communication-digest", title: "Communication Digest", category: "communication", renderKey: "valueor.communication-digest" },
];

export function getWidgetsForPlugin(pluginId: string): PluginWidgetContribution[] {
  return BUILTIN_WIDGETS.filter((w) => w.pluginId === pluginId);
}

export function isValidExtensionPoint(point: string): point is ExtensionPoint {
  return EXTENSION_POINTS.includes(point as ExtensionPoint);
}

export function catalogEntryFromRow(row: Record<string, unknown>, version: Record<string, unknown>): PluginCatalogEntry {
  return {
    id: String(row.id),
    pluginId: String(row.plugin_id),
    name: String(row.name),
    author: String(row.author),
    category: row.category as PluginCatalogEntry["category"],
    description: row.description ? String(row.description) : null,
    isOfficial: Boolean(row.is_official),
    latestVersion: String(version.version ?? "1.0.0"),
    permissions: (version.permissions as PluginCatalogEntry["permissions"]) ?? [],
    minPlatformVersion: String(version.min_platform_version ?? "7.0.0"),
  };
}
