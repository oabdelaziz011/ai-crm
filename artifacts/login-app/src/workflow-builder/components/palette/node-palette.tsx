import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CalendarPlus,
  Flag,
  GitBranch,
  GitMerge,
  HelpCircle,
  LayoutGrid,
  List,
  MessageCircle,
  MessageSquare,
  Play,
  Split,
  Timer,
  UserPen,
  UserPlus,
  Sparkles,
  ScanSearch,
  Scale,
  BookOpen,
} from "lucide-react";
import { listWorkflowNodeDefinitions, listWorkflowNodesByCategory } from "../../core/node-registry";
import { searchWorkflowNodes } from "../../core/search/node-search";
import { useWorkflowBuilderI18n } from "@/workflow-builder/hooks/use-workflow-builder-i18n";
import type { BuilderNodeCategory, BuilderNodeType } from "../../core/types";
import { cn } from "@/lib/utils";

const ICONS = {
  Play,
  MessageSquare,
  MessageCircle,
  HelpCircle,
  LayoutGrid,
  List,
  Timer,
  GitBranch,
  Split,
  GitMerge,
  Flag,
  UserPlus,
  UserPen,
  CalendarPlus,
  Sparkles,
  ScanSearch,
  Scale,
  BookOpen,
} as const;

function PaletteItem({ type, onDragStart }: { type: BuilderNodeType; onDragStart: (type: BuilderNodeType) => void }) {
  const { nodeText } = useWorkflowBuilderI18n();
  const definition = listWorkflowNodeDefinitions().find((node) => node.id === type);
  if (!definition) return null;
  const Icon = ICONS[definition.icon as keyof typeof ICONS] ?? MessageSquare;
  const displayName = nodeText(definition.id, "displayName", definition.displayName);
  const description = nodeText(definition.id, "description", definition.description);

  return (
    <motion.button
      type="button"
      draggable
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onDragStart={(event) => {
        const dragEvent = event as DragEvent;
        dragEvent.dataTransfer?.setData("application/workflow-node", type);
        if (dragEvent.dataTransfer) dragEvent.dataTransfer.effectAllowed = "move";
        onDragStart(type);
      }}
      className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-background/70 p-3 text-start shadow-sm transition hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className={`rounded-xl bg-gradient-to-br p-2 ${definition.accentClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 text-start">
        <p className="text-sm font-medium">{displayName}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </motion.button>
  );
}

function CategorySection({
  category,
  title,
  nodeTypes,
  onDragStart,
}: {
  category: BuilderNodeCategory;
  title: string;
  nodeTypes: BuilderNodeType[];
  onDragStart: (type: BuilderNodeType) => void;
}) {
  const nodes = listWorkflowNodesByCategory(category).filter((node) => nodeTypes.includes(node.id));
  if (nodes.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="space-y-2">
        {nodes.map((node) => (
          <PaletteItem key={node.id} type={node.id} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  );
}

export function NodePalette({
  onDragStart,
  className,
}: {
  onDragStart?: (type: BuilderNodeType) => void;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const handleDragStart = onDragStart ?? (() => undefined);
  const allNodes = useMemo(() => listWorkflowNodeDefinitions(), []);
  const results = useMemo(() => searchWorkflowNodes(query, allNodes), [allNodes, query]);
  const visibleIds = useMemo(() => new Set(results.map((node) => node.id)), [results]);

  return (
    <motion.aside
      id="workflow-builder-node-palette"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex w-full shrink-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border/60 bg-card/80 p-4 shadow-lg backdrop-blur",
        className,
      )}
    >
      <div>
        <p className="text-sm font-semibold">{t("workflowBuilder.palette.title")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("workflowBuilder.palette.subtitle")}</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("workflowBuilder.search.placeholder")}
          className="rounded-xl ps-9"
          aria-label={t("workflowBuilder.search.placeholder")}
        />
      </div>
      <div className="space-y-6">
        <CategorySection
          category="conversation"
          title={t("workflowBuilder.palette.conversation")}
          nodeTypes={allNodes.filter((node) => node.category === "conversation" && visibleIds.has(node.id)).map((node) => node.id)}
          onDragStart={handleDragStart}
        />
        <CategorySection
          category="logic"
          title={t("workflowBuilder.palette.logic")}
          nodeTypes={allNodes.filter((node) => node.category === "logic" && visibleIds.has(node.id)).map((node) => node.id)}
          onDragStart={handleDragStart}
        />
        <CategorySection
          category="crm"
          title={t("workflowBuilder.palette.crm")}
          nodeTypes={allNodes.filter((node) => node.category === "crm" && visibleIds.has(node.id)).map((node) => node.id)}
          onDragStart={handleDragStart}
        />
        <CategorySection
          category="ai"
          title={t("workflowBuilder.palette.ai")}
          nodeTypes={allNodes.filter((node) => node.category === "ai" && visibleIds.has(node.id)).map((node) => node.id)}
          onDragStart={handleDragStart}
        />
      </div>
    </motion.aside>
  );
}
