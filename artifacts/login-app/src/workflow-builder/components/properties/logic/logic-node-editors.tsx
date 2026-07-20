import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { normalizeVariableField } from "../../../core/logic/branch-utils";
import { VariablePicker } from "../../variables/variable-picker";

type SwitchCase = {
  id: string;
  label: string;
  value: string;
};

export function SwitchEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const field = typeof config.field === "string" ? config.field : "";
  const cases = Array.isArray(config.cases) ? (config.cases as SwitchCase[]) : [];
  const includeDefault = config.includeDefault !== false;

  const updateCases = (next: SwitchCase[]) => onChange({ cases: next });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.field")}</Label>
        <div className="flex items-center gap-2">
          <Input value={field} readOnly className="rounded-xl bg-background/80" placeholder={t("workflowBuilder.logic.chooseField")} />
          <VariablePicker onSelect={(variable) => onChange({ field: normalizeVariableField(variable.token) })} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{t("workflowBuilder.logic.cases")}</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() =>
              updateCases([
                ...cases,
                { id: crypto.randomUUID(), label: `Case ${cases.length + 1}`, value: `value-${cases.length + 1}` },
              ])
            }
          >
            <Plus className="me-1 h-4 w-4" />
            {t("workflowBuilder.logic.addCase")}
          </Button>
        </div>
        {cases.map((item, index) => (
          <div key={item.id} className="space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("workflowBuilder.logic.caseNumber", { number: index + 1 })}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => updateCases(cases.filter((entry) => entry.id !== item.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={item.label}
              placeholder={t("workflowBuilder.logic.branchLabel")}
              className="rounded-xl bg-background/80"
              onChange={(event) =>
                updateCases(cases.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry)))
              }
            />
            <Input
              value={item.value}
              placeholder={t("workflowBuilder.logic.matchValue")}
              className="rounded-xl bg-background/80"
              onChange={(event) =>
                updateCases(cases.map((entry) => (entry.id === item.id ? { ...entry, value: event.target.value } : entry)))
              }
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
        <div>
          <Label className="text-sm font-medium">{t("workflowBuilder.logic.defaultBranch")}</Label>
          <p className="text-xs text-muted-foreground">{t("workflowBuilder.logic.defaultBranchHint")}</p>
        </div>
        <Switch checked={includeDefault} onCheckedChange={(checked) => onChange({ includeDefault: checked })} />
      </div>
    </div>
  );
}

export function MergeEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const strategy = config.strategy === "any" ? "any" : "all";
  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium">{t("workflowBuilder.logic.mergeStrategy")}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={strategy === "all" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => onChange({ strategy: "all" })}
        >
          {t("workflowBuilder.logic.waitAll")}
        </Button>
        <Button
          type="button"
          variant={strategy === "any" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => onChange({ strategy: "any" })}
        >
          {t("workflowBuilder.logic.waitAny")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("workflowBuilder.logic.mergeHint")}</p>
    </div>
  );
}

export function WaitForReplyEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.optionalPrompt")}</Label>
        <Input
          value={typeof config.prompt === "string" ? config.prompt : ""}
          placeholder={t("workflowBuilder.logic.waitSilently")}
          className="rounded-xl bg-background/80"
          onChange={(event) => onChange({ prompt: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.saveReplyAs")}</Label>
        <Input
          value={typeof config.saveAs === "string" ? config.saveAs : "last_reply"}
          className="rounded-xl bg-background/80"
          onChange={(event) => onChange({ saveAs: event.target.value })}
        />
      </div>
    </div>
  );
}

export function EnhancedDelayEditor({ config, onChange }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const duration = Number(config.duration ?? config.waitMinutes ?? 1);
  const unit = typeof config.unit === "string" ? config.unit : "minutes";
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.waitTime")}</Label>
        <Input
          type="number"
          min={1}
          value={Number.isFinite(duration) ? duration : 1}
          className="rounded-xl bg-background/80"
          onChange={(event) => onChange({ duration: Number(event.target.value), waitMinutes: Number(event.target.value) })}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.logic.unit")}</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["minutes", "hours", "days"] as const).map((entry) => (
            <Button
              key={entry}
              type="button"
              variant={unit === entry ? "default" : "outline"}
              className="rounded-xl capitalize"
              onClick={() => onChange({ unit: entry })}
            >
              {t(`workflowBuilder.logic.${entry}`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/50 px-4 py-3">
        <div>
          <Label className="text-sm font-medium">{t("workflowBuilder.logic.businessHoursOnly")}</Label>
          <p className="text-xs text-muted-foreground">{t("workflowBuilder.logic.businessHoursHint")}</p>
        </div>
        <Switch
          checked={config.businessHoursOnly === true}
          onCheckedChange={(checked) => onChange({ businessHoursOnly: checked })}
        />
      </div>
    </div>
  );
}
