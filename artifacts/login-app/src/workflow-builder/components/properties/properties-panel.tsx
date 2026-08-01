import { memo, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { getWorkflowNodeDefinition } from "../../core/node-registry";
import { resolveNodePropertyEditorOverride } from "../../core/node-property-editor-registry";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import { resolveBuilderNodeEditorKey } from "../../core/persistence/builder-node-identity";
import { useBuilderActions, useDocumentBuilderSlice } from "../../context/workflow-builder-context";
import { PropertyEditorErrorBoundary } from "./property-editor-error-boundary";

export const PropertiesPanel = memo(function PropertiesPanel() {
  const { wb, nodeText } = useWorkflowBuilderI18n();
  const { document, selectedNodeIds } = useDocumentBuilderSlice();
  const { dispatch, updateNodeConfig } = useBuilderActions();

  const selected =
    selectedNodeIds.length === 1
      ? document.nodes.find((node) => node.id === selectedNodeIds[0])
      : document.nodes.find((node) => selectedNodeIds.includes(node.id));

  const handleConfigChange = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      updateNodeConfig(nodeId, patch);
    },
    [updateNodeConfig],
  );

  const applyConfigPatches = useCallback(
    (patches: Array<{ nodeId: string; patch: Record<string, unknown> }>) => {
      for (const entry of patches) {
        updateNodeConfig(entry.nodeId, entry.patch);
      }
    },
    [updateNodeConfig],
  );

  const generateInteractiveRouting = useCallback(() => {
    if (!selected) return;
    dispatch({ type: "GENERATE_INTERACTIVE_ROUTING", interactiveNodeId: selected.id });
  }, [dispatch, selected]);

  const editorContext = useMemo(
    () =>
      selected
        ? {
            nodeId: selected.id,
            document,
            applyConfigPatches,
            generateInteractiveRouting:
              selected.type === "buttons" || selected.type === "list" ? generateInteractiveRouting : undefined,
          }
        : undefined,
    [applyConfigPatches, document, generateInteractiveRouting, selected],
  );

  if (!selected) {
    return (
      <motion.aside
        id="workflow-builder-properties-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex shrink-0 flex-col rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg backdrop-blur"
      >
        <p className="text-sm font-semibold">{wb("properties.title")}</p>
        <p className="mt-2 text-start text-sm leading-relaxed text-muted-foreground">{wb("properties.empty")}</p>
      </motion.aside>
    );
  }

  const definition = getWorkflowNodeDefinition(selected.type);
  const PropertyEditor = resolveNodePropertyEditorOverride(selected.type) ?? definition.PropertyEditor;
  const displayName = nodeText(definition.id, "displayName", definition.displayName);
  const description = nodeText(definition.id, "description", definition.description);

  return (
    <motion.aside
      id="workflow-builder-properties-panel"
      className="flex shrink-0 flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg backdrop-blur"
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
});
