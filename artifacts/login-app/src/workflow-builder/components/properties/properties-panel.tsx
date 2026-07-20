import { motion } from "framer-motion";
import { getWorkflowNodeDefinition } from "../../core/node-registry";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import type { WorkflowBuilderController } from "../../hooks/use-workflow-builder";

export function PropertiesPanel({ controller }: { controller: WorkflowBuilderController }) {
  const { wb, nodeText } = useWorkflowBuilderI18n();
  const selected = controller.state.document.nodes.find((node) => controller.state.selectedNodeIds.includes(node.id));

  if (!selected) {
    return (
      <motion.aside
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
      layout
      className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/80 p-5 shadow-lg backdrop-blur"
    >
      <div className="text-start">
        <p className="text-base font-semibold">{displayName}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <PropertyEditor
        config={selected.config}
        onChange={(patch) => controller.dispatch({ type: "UPDATE_NODE_CONFIG", nodeId: selected.id, patch })}
      />
    </motion.aside>
  );
}
