import { CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { AgentTaskGraph, AgentTaskNode } from "@workspace/agent-runtime";

type AgentTaskGraphViewProps = {
  graph: AgentTaskGraph | null;
  className?: string;
};

function statusIcon(status: AgentTaskNode["status"]) {
  switch (status) {
    case "verified":
    case "completed":
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />;
    case "running":
    case "planning":
    case "retrying":
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />;
    case "failed":
      return <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />;
    case "waiting":
      return <Circle className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />;
    default:
      return <Circle className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />;
  }
}

function TaskNodeRow({ node, isLast }: { node: AgentTaskNode; isLast: boolean }) {
  const { t } = useTranslation("common");

  return (
    <div className="relative flex gap-3 pb-3">
      {!isLast && (
        <span
          className="absolute start-[7px] top-5 h-[calc(100%-8px)] w-px bg-border"
          aria-hidden="true"
        />
      )}
      <div className="relative z-10 mt-0.5">{statusIcon(node.status)}</div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium leading-tight">{node.title}</p>
          <span className="shrink-0 text-[10px] capitalize text-muted-foreground">{node.status}</span>
        </div>
        {node.description && (
          <p className="text-[10px] leading-snug text-muted-foreground">{node.description}</p>
        )}
        {node.tool && (
          <p className="font-mono text-[10px] text-primary/80">
            {t("floatingAi.agent.tool")}: {node.tool}
          </p>
        )}
        {node.retryCount > 0 && (
          <p className="text-[10px] text-amber-600">
            {t("floatingAi.agent.retries", { count: node.retryCount })}
          </p>
        )}
        {node.error && <p className="text-[10px] text-destructive">{node.error}</p>}
      </div>
    </div>
  );
}

export function AgentTaskGraphView({ graph, className }: AgentTaskGraphViewProps) {
  const { t } = useTranslation("common");

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">{t("floatingAi.agent.noWorkflow")}</p>
      </div>
    );
  }

  const parallelGroups = new Map<string, AgentTaskNode[]>();
  const sequential: AgentTaskNode[] = [];

  for (const node of graph.nodes) {
    if (node.parallelGroup) {
      const group = parallelGroups.get(node.parallelGroup) ?? [];
      group.push(node);
      parallelGroups.set(node.parallelGroup, group);
    } else {
      sequential.push(node);
    }
  }

  return (
    <div className={cn("overflow-y-auto px-3 py-2", className)}>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("floatingAi.agent.taskGraph")}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">{graph.goal}</p>

      {Array.from(parallelGroups.entries()).map(([groupId, nodes]) => (
        <div key={groupId} className="mb-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2">
          <p className="mb-2 text-[10px] font-medium text-primary">
            {t("floatingAi.agent.parallelGroup")} · {groupId}
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {nodes.map((node, index) => (
              <TaskNodeRow key={node.id} node={node} isLast={index === nodes.length - 1} />
            ))}
          </div>
        </div>
      ))}

      {sequential.map((node, index) => (
        <TaskNodeRow key={node.id} node={node} isLast={index === sequential.length - 1} />
      ))}
    </div>
  );
}

export function AgentTaskGraphMini({ graph }: { graph: AgentTaskGraph | null }) {
  if (!graph) return null;
  const done = graph.nodes.filter((n) => n.status === "verified" || n.status === "completed").length;
  return (
    <span className="text-[10px] text-muted-foreground">
      {done}/{graph.nodes.length}
    </span>
  );
}

export { RotateCcw as AgentResumeIcon };
