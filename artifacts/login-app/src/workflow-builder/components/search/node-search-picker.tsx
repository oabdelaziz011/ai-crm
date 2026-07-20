import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listWorkflowNodeDefinitions } from "../../core/node-registry";
import { searchWorkflowNodes } from "../../core/search/node-search";
import { useWorkflowBuilderI18n } from "../../hooks/use-workflow-builder-i18n";
import type { BuilderNodeType } from "../../core/types";

type NodeSearchPickerProps = {
  onSelect: (nodeType: BuilderNodeType) => void;
  autoFocus?: boolean;
};

export function NodeSearchPicker({ onSelect, autoFocus = false }: NodeSearchPickerProps) {
  const { t } = useTranslation("common");
  const { nodeText } = useWorkflowBuilderI18n();
  const [query, setQuery] = useState("");
  const allNodes = useMemo(() => listWorkflowNodeDefinitions(), []);
  const results = useMemo(() => searchWorkflowNodes(query, allNodes), [allNodes, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("workflowBuilder.search.placeholder")}
          className="rounded-xl ps-9"
        />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {results.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex w-full flex-col rounded-xl px-3 py-2 text-start transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="text-sm font-medium">{nodeText(node.id, "displayName", node.displayName)}</span>
            <span className="text-xs text-muted-foreground">{nodeText(node.id, "description", node.description)}</span>
          </button>
        ))}
        {results.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">{t("workflowBuilder.search.empty")}</p> : null}
      </div>
    </div>
  );
}
