import type { AutomationGraph } from "@/lib/automation/types";

type Props = {
  graph: AutomationGraph;
};

export function WorkflowGraphPreview({ graph }: Props) {
  if (!graph.nodes.length) {
    return <p className="text-sm text-muted-foreground">No graph data</p>;
  }

  const width = Math.max(640, graph.nodes.length * 140);
  const height = 120;

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-muted/20 p-4">
      <svg width={width} height={height} role="img" aria-label="Workflow graph preview">
        {graph.edges.map((edge) => {
          const source = graph.nodes.find((node) => node.id === edge.source);
          const target = graph.nodes.find((node) => node.id === edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={edge.id}
              x1={source.position.x + 60}
              y1={source.position.y + 24}
              x2={target.position.x + 10}
              y2={target.position.y + 24}
              stroke="currentColor"
              strokeOpacity={0.35}
              strokeWidth={2}
            />
          );
        })}
        {graph.nodes.map((node) => (
          <g key={node.id} transform={`translate(${node.position.x}, ${node.position.y})`}>
            <rect width={120} height={48} rx={10} fill="hsl(var(--card))" stroke="hsl(var(--border))" />
            <text x={60} y={20} textAnchor="middle" className="fill-foreground text-[10px] font-medium">
              {node.type}
            </text>
            <text x={60} y={36} textAnchor="middle" className="fill-muted-foreground text-[9px]">
              {node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
