import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BuilderPopover } from "../ui/builder-popover";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { NodeSearchPicker } from "../search/node-search-picker";
import type { BuilderNodeType } from "../../core/types";

type QuickAddButtonProps = {
  onSelect: (nodeType: BuilderNodeType) => void;
};

export function QuickAddButton({ onSelect }: QuickAddButtonProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);

  return (
    <BuilderPopover
      open={open}
      onOpenChange={setOpen}
      align="center"
      contentClassName="w-80 rounded-2xl p-4"
      trigger={
        <Button
          type="button"
          size="icon"
          className="absolute -bottom-4 left-1/2 z-20 h-8 w-8 -translate-x-1/2 rounded-full border border-border/70 bg-background shadow-lg transition hover:scale-105 hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={t("workflowBuilder.quickAdd.label")}
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <p className="mb-3 text-sm font-semibold">{t("workflowBuilder.quickAdd.title")}</p>
      <NodeSearchPicker
        autoFocus
        onSelect={(nodeType) => {
          onSelect(nodeType);
          setOpen(false);
        }}
      />
    </BuilderPopover>
  );
}
