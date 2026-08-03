import { useEffect } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { designerEngine, DEFAULT_DESIGNER_STATE } from "@workspace/universal-workspace-platform";
import { useWorkspacePlatform } from "@/context/workspace-platform-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WorkspaceDesigner() {
  const { t } = useTranslation("common");
  const { designerState, setDesignerState, addDesignerBlock, removeDesignerBlock, templateKey } = useWorkspacePlatform();
  const palette = designerEngine.getPalette();

  useEffect(() => {
    if (!designerState) {
      setDesignerState({
        ...designerEngine.createState(t("workspacePlatform.designer.defaultName"), templateKey),
        canvasBlocks: [...DEFAULT_DESIGNER_STATE.canvasBlocks],
      });
    }
  }, [designerState, setDesignerState, templateKey, t]);

  if (!designerState) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div className="rounded-2xl border border-border/60 bg-card/90 p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("workspacePlatform.designer.palette")}
        </p>
        <div className="space-y-1.5">
          {palette.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => addDesignerBlock(item.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-start text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Plus className="size-3.5 shrink-0 text-primary" />
              {t(`workspacePlatform.${item.labelKey}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-primary/30 bg-muted/10 p-4 min-h-[400px]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">{designerState.name}</h3>
            <p className="text-xs text-muted-foreground">{t("workspacePlatform.designer.canvasHint")}</p>
          </div>
          <Button size="sm" variant="outline" disabled className="text-xs">
            {t("workspacePlatform.designer.save")}
          </Button>
        </div>
        <div className="space-y-2">
          {designerState.canvasBlocks.map((block) => (
            <div
              key={block.id}
              className={cn(
                "group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3",
                "transition-all hover:border-primary/30 hover:shadow-sm",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold capitalize">{block.type.replace("_", " ")}</p>
                <p className="text-[10px] text-muted-foreground">{t(`workspacePlatform.${block.labelKey}`)}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 opacity-0 group-hover:opacity-100"
                onClick={() => removeDesignerBlock(block.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {designerState.canvasBlocks.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("workspacePlatform.designer.emptyCanvas")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
