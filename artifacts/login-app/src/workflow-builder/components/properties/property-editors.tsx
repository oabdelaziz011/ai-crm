import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NodePropertyEditorProps } from "../../core/node-registry";
import { buildInteractiveOptionIdRefactorPatches } from "../../core/logic/interactive-config-refactor";
import { slugifyInteractionOptionId } from "../../core/variables/interaction-variables";
import { GenerateRoutingAction } from "./conversation/generate-routing-action";

type ListRow = {
  id: string;
  title?: string;
  titleAr?: string;
  titleEn?: string;
  description?: string;
  value?: string;
};

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeListRow(row: ListRow): ListRow {
  const titleAr = row.titleAr ?? "";
  const titleEn = row.titleEn ?? "";
  return {
    ...row,
    titleAr,
    titleEn,
    title: titleAr.trim() || titleEn.trim() || row.title || "",
  };
}

function readListRows(config: Record<string, unknown>): ListRow[] {
  if (!Array.isArray(config.rows)) {
    return [{ id: crypto.randomUUID(), title: "Option 1", titleAr: "الخيار 1", titleEn: "Option 1", description: "" }];
  }
  return (config.rows as ListRow[]).map((row, index) => {
    const titleAr = typeof row.titleAr === "string" ? row.titleAr : "";
    const titleEn = typeof row.titleEn === "string" ? row.titleEn : "";
    const title = typeof row.title === "string" ? row.title : "";
    const hasBilingual = Boolean(titleAr.trim() || titleEn.trim());
    const looksArabic = /[\u0600-\u06FF]/.test(title);
    return {
      id: row.id ?? String(index + 1),
      title: title || titleAr || titleEn,
      titleAr: hasBilingual ? titleAr : looksArabic ? title : "",
      titleEn: hasBilingual ? titleEn : looksArabic ? "" : title,
      description: row.description ?? "",
      value: row.value ?? "",
    };
  });
}

export function TextFieldEditor({
  label,
  labelKey,
  field,
  config,
  onChange,
  multiline = false,
  placeholder,
}: NodePropertyEditorProps & {
  label?: string;
  labelKey?: string;
  field: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation("common");
  const resolvedLabel = labelKey
    ? t(`workflowBuilder.logic.${labelKey}`, { defaultValue: label ?? labelKey })
    : (label ?? "");
  const value = readString(config[field]);
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{resolvedLabel}</Label>
      {multiline ? (
        <Textarea
          value={value}
          placeholder={placeholder}
          rows={4}
          onChange={(event) => onChange({ [field]: event.target.value })}
          className="min-h-24 resize-y rounded-xl bg-background/80"
        />
      ) : (
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange({ [field]: event.target.value })}
          className="rounded-xl bg-background/80"
        />
      )}
    </div>
  );
}

export function ButtonListEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const buttons = Array.isArray(config.buttons)
    ? (config.buttons as Array<{ id?: string; label?: string }>)
    : [
        { id: "1", label: "Option 1" },
        { id: "2", label: "Option 2" },
      ];

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{t("workflowBuilder.fields.buttons")}</Label>
      {buttons.map((button, index) => (
        <Input
          key={index}
          value={readString(button.label)}
          placeholder={t("workflowBuilder.fields.buttonLabel", { number: index + 1 })}
          onChange={(event) => {
            const next = buttons.map((entry, idx) =>
              idx === index ? { ...entry, id: entry.id ?? String(index + 1), label: event.target.value } : entry,
            );
            onChange({ buttons: next });
          }}
          className="rounded-xl bg-background/80"
        />
      ))}
    </div>
  );
}

export function ListRowsEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const rows = readListRows(config);

  const updateRows = (next: ListRow[]) => onChange({ rows: next.map((row) => normalizeListRow(row)) });

  const applyIdRefactor = (oldId: string, newId: string) => {
    if (!context || oldId === newId) return;
    const patches = buildInteractiveOptionIdRefactorPatches(context.document, context.nodeId, oldId, newId);
    if (patches.length > 0) context.applyConfigPatches(patches);
  };

  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateRows(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.listOptions")}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() =>
            updateRows([
              ...rows,
              { id: crypto.randomUUID(), title: "", titleAr: "", titleEn: "", description: "" },
            ])
          }
        >
          <Plus className="me-2 h-4 w-4" />
          {t("workflowBuilder.fields.addListOption")}
        </Button>
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="space-y-2 rounded-xl border border-border/60 bg-background/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("workflowBuilder.logic.caseNumber", { number: index + 1 })}
            </Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
                aria-label={t("workflowBuilder.fields.moveOptionUp")}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
                aria-label={t("workflowBuilder.fields.moveOptionDown")}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-destructive"
                disabled={rows.length <= 1}
                onClick={() => updateRows(rows.filter((entry) => entry.id !== row.id))}
                aria-label={t("workflowBuilder.fields.deleteButton")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              dir="rtl"
              value={readString(row.titleAr)}
              placeholder={t("workflowBuilder.fields.listTitleArabic", { number: index + 1 })}
              onChange={(event) => {
                const next = rows.map((entry) =>
                  entry.id === row.id ? { ...entry, titleAr: event.target.value } : entry,
                );
                updateRows(next);
              }}
              className="rounded-xl bg-background/80"
            />
            <Input
              dir="ltr"
              value={readString(row.titleEn)}
              placeholder={t("workflowBuilder.fields.listTitleEnglish", { number: index + 1 })}
              onChange={(event) => {
                const next = rows.map((entry) =>
                  entry.id === row.id ? { ...entry, titleEn: event.target.value } : entry,
                );
                updateRows(next);
              }}
              className="rounded-xl bg-background/80"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("workflowBuilder.fields.bilingualListRowHint")}</p>
          <Input
            value={readString(row.value)}
            placeholder={t("workflowBuilder.fields.listStoredValue")}
            onChange={(event) => {
              const next = rows.map((entry) =>
                entry.id === row.id ? { ...entry, value: event.target.value } : entry,
              );
              updateRows(next);
            }}
            className="rounded-xl bg-background/80 font-mono text-xs"
          />
          <Input
            value={row.id}
            placeholder={t("workflowBuilder.fields.buttonId")}
            onChange={(event) => {
              const newId = slugifyInteractionOptionId(event.target.value, row.id);
              const next = rows.map((entry) => (entry.id === row.id ? { ...entry, id: newId } : entry));
              updateRows(next);
              applyIdRefactor(row.id, newId);
            }}
            className="rounded-xl bg-background/80 font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground -mt-1">{t("workflowBuilder.fields.buttonIdHint")}</p>
          <Input
            value={readString(row.description)}
            placeholder={t("workflowBuilder.logic.shortDescription")}
            onChange={(event) => {
              const next = rows.map((entry) =>
                entry.id === row.id ? { ...entry, description: event.target.value } : entry,
              );
              updateRows(next);
            }}
            className="rounded-xl bg-background/80"
          />
        </div>
      ))}
      <GenerateRoutingAction context={context} />
    </div>
  );
}

export function DelayEditor({ config, onChange }: NodePropertyEditorProps) {
  return (
    <TextFieldEditor
      labelKey="waitMinutes"
      field="waitMinutes"
      config={{ waitMinutes: readNumber(config.waitMinutes, 1) }}
      onChange={(patch: Record<string, unknown>) => onChange({ waitMinutes: readNumber(patch.waitMinutes, 1) })}
      placeholder="1"
    />
  );
}

export function EmptyProperties({ labelKey }: { labelKey: "start" | "end" | "return_to_main_menu" }) {
  const { t } = useTranslation("common");
  return <p className="text-sm text-muted-foreground">{t(`workflowBuilder.nodeEmpty.${labelKey}`)}</p>;
}

export function requiredTextIssue(
  field: string,
  fieldLabelKey: string,
  nodeId: string,
  config: Record<string, unknown>,
) {
  const value = readString(config[field]).trim();
  if (value) return [];
  return [
    {
      id: `${nodeId}-${field}-required`,
      nodeId,
      message: `Add ${fieldLabelKey} before publishing.`,
      severity: "error" as const,
      fieldLabelKey,
    },
  ];
}
