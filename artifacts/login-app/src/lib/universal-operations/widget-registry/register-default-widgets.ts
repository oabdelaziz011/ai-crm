import { overviewWidgets } from "@/components/universal-operations/operation-workspace/widgets/overview-widgets";
import { sectionWidgets } from "@/components/universal-operations/operation-workspace/widgets/section-widgets";
import { operationWidgetRegistry } from "./registry";

let registered = false;

export function registerDefaultOperationWidgets() {
  if (!registered) {
    operationWidgetRegistry.registerMany([...overviewWidgets, ...sectionWidgets]);
    registered = true;
  }
  return operationWidgetRegistry;
}

export function getOperationWidgetRegistry() {
  return registerDefaultOperationWidgets();
}
