import { useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { getWorkflowNodeDefinition } from "../../core/node-registry";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import { resolveBuilderNodeEditorKey } from "../../core/persistence/builder-node-identity";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";
import { PropertyEditorErrorBoundary } from "./property-editor-error-boundary";

export function PropertiesPanel({ controller }: { controller: WorkflowBuilderController }) {
  const { wb, nodeText } = useWorkflowBuilderI18n();
  const selected =
    controller.state.selectedNodeIds.length === 1
      ? controller.state.document.nodes.find((node) => node.id === controller.state.selectedNodeIds[0])
      : controller.state.document.nodes.find((node) => controller.state.selectedNodeIds.includes(node.id));

  const handleConfigChange = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      controller.dispatch({ type: "UPDATE_NODE_CONFIG", nodeId, patch });
    },
    [controller],
  );

  const applyConfigPatches = useCallback(
    (patches: Array<{ nodeId: string; patch: Record<string, unknown> }>) => {
      for (const entry of patches) {
        controller.dispatch({ type: "UPDATE_NODE_CONFIG", nodeId: entry.nodeId, patch: entry.patch });
      }
    },
    [controller],
  );

  const editorContext = useMemo(
    () =>
      selected
        ? {
            nodeId: selected.id,
            document: controller.state.document,
            applyConfigPatches,
          }
        : undefined,
    [applyConfigPatches, controller.state.document, selected],
  );

  if (!selected) {
    return (
      <motion.aside
        id="workflow-builder-properties-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex h-full flex-col rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg backdrop-blur"
      >
        <p className="text-sm font-semibold">{wb("properties.title")}</p>
        <p className="mt-2 text-start text-sm leading-relaxed text-muted-foreground">{wb("properties.empty")}</p>
      </motion.aside>
    );
  }

  const definition = getWorkflowNodeDefinition(selected.type);
  const PropertyEditor = definition.PropertyEditor;
  const displayName = nodeText(definition.id, "displayName", definition.displayName);
  const description = nodeText(definition.id, "description", definition.description);

  return (
    <motion.aside
      id="workflow-builder-properties-panel"
      className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg backdrop-blur"
    >
      <div className="text-start">
        <p className="text-base font-semibold">{displayName}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <PropertyEditorErrorBoundary nodeType={selected.type}>
        <PropertyEditor
          key={resolveBuilderNodeEditorKey(selected)}
          config={selected.config}
          onChange={(patch) => handleConfigChange(selected.id, patch)}
          context={editorContext}
        />
      </PropertyEditorErrorBoundary>
    </motion.aside>
  );
}
