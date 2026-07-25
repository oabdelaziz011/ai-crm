import { useTranslation } from "react-i18next";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildInteractiveOptionIdRefactorPatches } from "../../../core/logic/interactive-config-refactor";
import { slugifyInteractionOptionId } from "../../../core/variables/interaction-variables";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { PrimaryMenuToggle } from "../conversation/primary-menu-toggle";
import { GenerateRoutingAction } from "../conversation/generate-routing-action";
import { MessageFieldEditor } from "./message-field-editor";

type ButtonRow = { id: string; label: string };

function readButtons(config: Record<string, unknown>): ButtonRow[] {
  if (!Array.isArray(config.buttons)) {
    return [
      { id: "book", label: "Book Appointment" },
      { id: "pricing", label: "Pricing" },
    ];
  }
  return (config.buttons as ButtonRow[]).map((button, index) => ({
    id: button.id ?? String(index + 1),
    label: button.label ?? "",
  }));
}

export function RichButtonListEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const buttons = readButtons(config);

  const updateButtons = (next: ButtonRow[]) => onChange({ buttons: next });

  const applyIdRefactor = (oldId: string, newId: string) => {
    if (!context || oldId === newId) return;
    const patches = buildInteractiveOptionIdRefactorPatches(context.document, context.nodeId, oldId, newId);
    if (patches.length > 0) context.applyConfigPatches(patches);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= buttons.length) return;
    const next = [...buttons];
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateButtons(next);
  };

  return (
    <div className="space-y-4">
      <PrimaryMenuToggle config={config} onChange={onChange} context={context} />
      <MessageFieldEditor config={config} onChange={onChange} field="message" />
      <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">{t("workflowBuilder.fields.buttons")}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => {
              const label = "";
              const id = slugifyInteractionOptionId(`option_${buttons.length + 1}`, String(buttons.length + 1));
              updateButtons([...buttons, { id, label }]);
            }}
          >
            <Plus className="me-2 h-4 w-4" />
            {t("workflowBuilder.fields.addButton")}
          </Button>
        </div>
        {buttons.map((button, index) => (
          <div key={`${button.id}-${index}`} className="space-y-2 rounded-xl border border-border/60 bg-background/80 p-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => move(index, -1)} aria-label={t("workflowBuilder.fields.moveUp")}>
                <GripVertical className="h-4 w-4" />
              </Button>
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <Input
                  value={button.label}
                  placeholder={t("workflowBuilder.fields.buttonLabel", { number: index + 1 })}
                  onChange={(event) => {
                    const next = buttons.map((entry, idx) =>
                      idx === index ? { ...entry, label: event.target.value } : entry,
                    );
                    updateButtons(next);
                  }}
                  className="rounded-xl"
                />
                <Input
                  value={button.id}
                  placeholder={t("workflowBuilder.fields.buttonId")}
                  onChange={(event) => {
                    const newId = slugifyInteractionOptionId(event.target.value, button.id);
                    const next = buttons.map((entry, idx) => (idx === index ? { ...entry, id: newId } : entry));
                    updateButtons(next);
                    applyIdRefactor(button.id, newId);
                  }}
                  className="rounded-xl font-mono text-xs"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-destructive"
                disabled={buttons.length <= 1}
                onClick={() => updateButtons(buttons.filter((_, idx) => idx !== index))}
                aria-label={t("workflowBuilder.fields.deleteButton")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="ps-10 text-[11px] text-muted-foreground">{t("workflowBuilder.fields.buttonIdHint")}</p>
          </div>
        ))}
      </div>
      <GenerateRoutingAction context={context} />
    </div>
  );
}
