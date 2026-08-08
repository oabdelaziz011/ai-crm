import type {
  OperationWidgetContext,
  OperationWidgetDefinition,
  OperationWorkspaceTabId,
  ResolvedOperationWidget,
} from "./types";

export class OperationWidgetRegistry {
  private readonly widgets = new Map<string, OperationWidgetDefinition>();

  register(widget: OperationWidgetDefinition): void {
    if (this.widgets.has(widget.id)) {
      throw new Error(`Widget already registered: ${widget.id}`);
    }
    this.widgets.set(widget.id, widget);
  }

  registerMany(widgets: OperationWidgetDefinition[]): void {
    for (const widget of widgets) this.register(widget);
  }

  list(): OperationWidgetDefinition[] {
    return [...this.widgets.values()];
  }

  getWidgetsForTab(
    tab: OperationWorkspaceTabId,
    ctx: OperationWidgetContext,
    translate: (key: string) => string,
  ): ResolvedOperationWidget[] {
    return this.list()
      .filter((widget) => widget.tabs.includes(tab))
      .filter((widget) => widget.visible(ctx))
      .sort((a, b) => a.order - b.order)
      .map((widget) => ({
        ...widget,
        title: translate(widget.titleKey),
      }));
  }
}

export const operationWidgetRegistry = new OperationWidgetRegistry();
