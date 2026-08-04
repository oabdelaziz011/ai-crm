import type { OperationsDashboardWidgetConfig } from "@workspace/universal-operations-engine";
import { OperationsRuntimeConfigurationError } from "@workspace/universal-operations-engine";
import type { WorkspaceWidgetSnapshot } from "../types/widget-types.js";

export class WidgetEngine {
  buildSnapshots(widgets: OperationsDashboardWidgetConfig[]): WorkspaceWidgetSnapshot[] {
    if (!widgets.length) {
      throw new OperationsRuntimeConfigurationError(
        "configuration.dashboard.widgets is required — no runtime widget fallback available",
      );
    }

    return widgets
      .filter((w) => w.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((w) => ({
        widgetId: w.id,
        type: w.type,
        title: w.labelKey,
        data: [],
        updatedAt: new Date().toISOString(),
      }));
  }
}

export const widgetEngine = new WidgetEngine();
