import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ExecutionInspectorViewModel } from "../selectors/debugger-ui-selectors";

type ExecutionInspectorProps = {
  model: ExecutionInspectorViewModel;
  onSelectNode: (nodeId: string | null) => void;
};

export const ExecutionInspector = memo(function ExecutionInspector({ model, onSelectNode }: ExecutionInspectorProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-3 text-sm">
      <DetailRow label={t("workflowBuilder.debugger.execution.workflowState")} value={model.workflowState} />
      <NodeRow
        label={t("workflowBuilder.debugger.execution.current")}
        nodeId={model.currentNodeId}
        nodeLabel={model.currentNodeLabel}
        nodeType={model.currentNodeType}
        onSelect={onSelectNode}
      />
      <NodeRow
        label={t("workflowBuilder.debugger.execution.previous")}
        nodeId={model.previousNodeId}
        nodeLabel={model.previousNodeLabel}
        nodeType={null}
        onSelect={onSelectNode}
      />
      <NodeRow
        label={t("workflowBuilder.debugger.execution.next")}
        nodeId={model.nextNodeId}
        nodeLabel={model.nextNodeLabel}
        nodeType={null}
        onSelect={onSelectNode}
      />
    </div>
  );
});

function NodeRow({
  label,
  nodeId,
  nodeLabel,
  nodeType,
  onSelect,
}: {
  label: string;
  nodeId: string | null;
  nodeLabel: string | null;
  nodeType: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  if (!nodeId) {
    return <DetailRow label={label} value="—" />;
  }

  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <button type="button" className="text-end" onClick={() => onSelect(nodeId)}>
        <span className="block font-medium">{nodeLabel ?? nodeId}</span>
        {nodeType ? (
          <Badge variant="outline" className="mt-1 rounded-full text-[10px] uppercase">
            {nodeType}
          </Badge>
        ) : null}
      </button>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
