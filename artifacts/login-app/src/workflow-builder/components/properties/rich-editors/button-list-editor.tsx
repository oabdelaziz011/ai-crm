import { useEffect, useState } from "react";
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

/** WhatsApp interactive reply buttons allow at most 3 options. */
export const WHATSAPP_MAX_REPLY_BUTTONS = 3;

type ButtonRow = {
  id: string;
  label: string;
  labelAr?: string;
  labelEn?: string;
};

function readButtons(config: Record<string, unknown>): ButtonRow[] {
  if (!Array.isArray(config.buttons)) {
    return [];
  }
  return (config.buttons as ButtonRow[]).map((button, index) => {
    const labelAr = typeof button.labelAr === "string" ? button.labelAr : "";
    const labelEn = typeof button.labelEn === "string" ? button.labelEn : "";
    const label = typeof button.label === "string" ? button.label : "";
    const hasBilingual = Boolean(labelAr.trim() || labelEn.trim());
    const looksArabic = /[\u0600-\u06FF]/.test(label);
    return {
      id: button.id ?? `option_${index + 1}`,
      label: label || labelEn || labelAr,
      labelAr: hasBilingual ? labelAr : looksArabic ? label : "",
      labelEn: hasBilingual ? labelEn : looksArabic ? "" : label,
    };
  });
}

function normalizeButtonRow(row: ButtonRow): ButtonRow {
  // Do not trim while typing — trailing spaces would be removed on every keystroke
  // and block multi-word labels like "حجز موعد" / "Book now".
  const labelAr = row.labelAr ?? "";
  const labelEn = row.labelEn ?? "";
  return {
    id: row.id,
    labelAr,
    labelEn,
    // Keep a display fallback that prefers whichever bilingual label has content.
    // Runtime localizes from labelAr/labelEn; this covers older paths.
    label: labelAr.trim() || labelEn.trim() || row.label || "",
  };
}

function trimButtonLabels(row: ButtonRow): ButtonRow {
  return normalizeButtonRow({
    ...row,
    labelAr: row.labelAr?.trim() ?? "",
    labelEn: row.labelEn?.trim() ?? "",
  });
}

function nextUniqueButtonId(existing: ButtonRow[]): string {
  let n = existing.length + 1;
  let candidate = `option_${n}`;
  const used = new Set(existing.map((row) => row.id));
  while (used.has(candidate)) {
    n += 1;
    candidate = `option_${n}`;
  }
  return candidate;
}

function ButtonIdField({
  id,
  index,
  onCommit,
}: {
  id: string;
  index: number;
  onCommit: (oldId: string, newId: string) => void;
}) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState(id);

  useEffect(() => {
    setDraft(id);
  }, [id]);

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{t("workflowBuilder.fields.buttonId")}</Label>
      <Input
        value={draft}
        placeholder={t("workflowBuilder.fields.buttonIdPlaceholder")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const committed = slugifyInteractionOptionId(draft, `option_${index + 1}`);
          setDraft(committed);
          if (committed !== id) onCommit(id, committed);
        }}
        className="rounded-xl font-mono text-xs"
        dir="ltr"
      />
      <p className="text-[11px] text-muted-foreground">{t("workflowBuilder.fields.buttonIdHint")}</p>
    </div>
  );
}

export function RichButtonListEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const buttons = readButtons(config);
  const exceedsWhatsAppLimit = buttons.length > WHATSAPP_MAX_REPLY_BUTTONS;

  const updateButtons = (next: ButtonRow[]) =>
    onChange({ buttons: next.map((row) => normalizeButtonRow(row)) });

  const applyIdRefactor = (oldId: string, newId: string) => {
    if (!context || oldId === newId) return;
    const patches = buildInteractiveOptionIdRefactorPatches(context.document, context.nodeId, oldId, newId);
    if (patches.length > 0) context.applyConfigPatches(patches);
  };

  const commitButtonId = (index: number, oldId: string, newId: string) => {
    const next = buttons.map((entry, idx) => (idx === index ? { ...entry, id: newId } : entry));
    updateButtons(next);
    applyIdRefactor(oldId, newId);
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
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label className="text-sm font-semibold">{t("workflowBuilder.fields.buttons")}</Label>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("workflowBuilder.fields.bilingualButtonsHint")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 rounded-xl"
            onClick={() => {
              const id = nextUniqueButtonId(buttons);
              updateButtons([...buttons, { id, label: "", labelAr: "", labelEn: "" }]);
            }}
          >
            <Plus className="me-2 h-4 w-4" />
            {t("workflowBuilder.fields.addButton")}
          </Button>
        </div>
        {exceedsWhatsAppLimit ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          >
            {t("workflowBuilder.fields.whatsappButtonLimit", { max: WHATSAPP_MAX_REPLY_BUTTONS })}
          </div>
        ) : null}
        {buttons.map((button, index) => (
          <div
            key={`button-row-${index}`}
            className={
              index >= WHATSAPP_MAX_REPLY_BUTTONS
                ? "space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 opacity-80"
                : "space-y-2 rounded-xl border border-border/60 bg-background/80 p-3"
            }
          >
            {index >= WHATSAPP_MAX_REPLY_BUTTONS ? (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {t("workflowBuilder.fields.whatsappButtonDropped")}
              </p>
            ) : null}
            <div className="flex items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 h-7 w-7 rounded-lg"
                onClick={() => move(index, -1)}
                aria-label={t("workflowBuilder.fields.moveUp")}
              >
                <GripVertical className="h-4 w-4" />
              </Button>
              <div className="grid flex-1 gap-2">
                <ButtonIdField
                  id={button.id}
                  index={index}
                  onCommit={(oldId, newId) => commitButtonId(index, oldId, newId)}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("workflowBuilder.fields.buttonLabelArabic")}
                    </Label>
                    <Input
                      dir="rtl"
                      value={button.labelAr ?? ""}
                      placeholder={t("workflowBuilder.fields.buttonLabelArabicPlaceholder")}
                      maxLength={20}
                      onChange={(event) => {
                        const next = buttons.map((entry, idx) =>
                          idx === index ? { ...entry, labelAr: event.target.value } : entry,
                        );
                        updateButtons(next);
                      }}
                      onBlur={() => {
                        const next = buttons.map((entry, idx) => (idx === index ? trimButtonLabels(entry) : entry));
                        updateButtons(next);
                      }}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      {t("workflowBuilder.fields.buttonLabelEnglish")}
                    </Label>
                    <Input
                      dir="ltr"
                      value={button.labelEn ?? ""}
                      placeholder={t("workflowBuilder.fields.buttonLabelEnglishPlaceholder")}
                      maxLength={20}
                      onChange={(event) => {
                        const next = buttons.map((entry, idx) =>
                          idx === index ? { ...entry, labelEn: event.target.value } : entry,
                        );
                        updateButtons(next);
                      }}
                      onBlur={() => {
                        const next = buttons.map((entry, idx) => (idx === index ? trimButtonLabels(entry) : entry));
                        updateButtons(next);
                      }}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-1 h-9 w-9 rounded-xl text-destructive"
                onClick={() => updateButtons(buttons.filter((_, idx) => idx !== index))}
                aria-label={t("workflowBuilder.fields.deleteButton")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <GenerateRoutingAction context={context} />
    </div>
  );
}

export function buttonHasAnyLabel(button: unknown): boolean {
  if (!button || typeof button !== "object") return false;
  const row = button as ButtonRow;
  return Boolean(
    String(row.label ?? "").trim() ||
      String(row.labelAr ?? "").trim() ||
      String(row.labelEn ?? "").trim(),
  );
}
