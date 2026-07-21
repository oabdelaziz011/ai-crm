import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  CalendarPlus,
  Flag,
  HelpCircle,
  LayoutGrid,
  List,
  MessageSquare,
  Play,
  Timer,
  UserPen,
  UserPlus,
} from "lucide-react";
import { getWorkflowNodeDefinition } from "../../core/node-registry";
import { getCategoryTokens, resolveVisualCategory } from "../../core/visual/category-tokens";
import { createBuilderNode } from "../../core/persistence/workflow-mapper";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import type { BuilderNodeType } from "../../core/types";
import { QuickAddButton } from "../canvas/quick-add-button";

const ICONS = {
  Play,
  MessageSquare,
  HelpCircle,
  LayoutGrid,
  List,
  Timer,
  Flag,
  UserPlus,
  UserPen,
  CalendarPlus,
} as const;

export type WorkflowNodeData = {
  label: string;
  nodeType: BuilderNodeType;
  subtitle?: string;
  onQuickAdd?: (sourceNodeId: string, nodeType: BuilderNodeType) => void;
  executionStatus?: "ready" | "running" | "completed" | "failed";
};

function WorkflowNodeCardComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const { wb, categoryLabel, executionStatusLabel } = useWorkflowBuilderI18n();
  const definition = getWorkflowNodeDefinition(nodeData.nodeType);
  const tokens = getCategoryTokens(nodeData.nodeType);
  const visualCategory = resolveVisualCategory(nodeData.nodeType);
  const Icon = ICONS[definition.icon as keyof typeof ICONS] ?? MessageSquare;

  const handleQuickAdd = useCallback(
    (nodeType: BuilderNodeType) => {
      if (!nodeData.onQuickAdd) return;
      nodeData.onQuickAdd(id, nodeType);
    },
    [id, nodeData],
  );

  const statusLabel = executionStatusLabel(nodeData.executionStatus ?? "ready");
  const stepName = nodeData.label;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`group relative min-w-[248px] rounded-3xl border bg-card/95 p-4 shadow-lg backdrop-blur transition-shadow ${
        selected ? `ring-2 ${tokens.ring} shadow-xl` : "shadow-black/10 hover:shadow-xl"
      } ${tokens.border} bg-gradient-to-br ${tokens.accent}`}
      role="group"
      aria-label={wb("connection.stepAria", { name: stepName })}
    >
      {definition.allowIncoming && (
        <Handle
          id="target"
          type="target"
          position={Position.Top}
          className={`!h-3.5 !w-3.5 !border-2 !border-background ${tokens.handle}`}
          aria-label={wb("connection.fromPrevious")}
        />
      )}

      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {statusLabel}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {categoryLabel(visualCategory)}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <div className={`rounded-2xl p-2.5 shadow-inner ${tokens.iconBg}`}>
          <Icon className={`h-5 w-5 ${tokens.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1 text-start">
          <p className="text-sm font-semibold text-foreground">{stepName}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{nodeData.subtitle}</p>
        </div>
      </div>

      {definition.allowOutgoing && (
        <>
          <Handle
            id="source"
            type="source"
            position={Position.Bottom}
            className={`!h-3.5 !w-3.5 !border-2 !border-background ${tokens.handle}`}
            aria-label={wb("connection.toNext")}
          />
          {nodeData.onQuickAdd ? (
            <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <QuickAddButton onSelect={handleQuickAdd} />
            </div>
          ) : null}
        </>
      )}
    </motion.div>
  );
}

export const WorkflowNodeCard = memo(WorkflowNodeCardComponent);

export const workflowNodeTypes = {
  workflowNode: WorkflowNodeCard,
};

export function createQuickAddNode(sourceNodeId: string, nodeType: BuilderNodeType) {
  return { sourceNodeId, nodeType };
}

export function quickAddPosition(sourceNodeId: string, getNodePosition: (id: string) => { x: number; y: number } | undefined) {
  const source = getNodePosition(sourceNodeId);
  return {
    x: source?.x ?? 120,
    y: (source?.y ?? 120) + 168,
  };
}
