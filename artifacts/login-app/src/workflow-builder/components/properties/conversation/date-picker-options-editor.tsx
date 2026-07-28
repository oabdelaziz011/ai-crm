import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodePropertyEditorProps } from "../../../core/node-registry";
import { readDatePickerConstraintOptions } from "../../../core/conversation/date-picker-node-config";
import { useBusinessCalendarConstraints } from "@/hooks/scheduling/use-business-calendar-constraints";
import { DatePickerCalendarPreview } from "./date-picker-calendar-preview";

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function DatePickerOptionsEditor({ config, onChange, context }: NodePropertyEditorProps) {
  const { t } = useTranslation("common");
  const companyId = context?.document?.companyId ?? null;
  const constraintOptions = useMemo(() => readDatePickerConstraintOptions(config), [config]);
  const { data: constraints, isLoading, error } = useBusinessCalendarConstraints(companyId, constraintOptions);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.fields.saveSelectedDateAs")}</Label>
        <Input
          value={readString(config.saveAs)}
          onChange={(event) => onChange({ saveAs: event.target.value, inputKey: event.target.value })}
          className="rounded-xl font-mono text-sm"
          placeholder="selected_date"
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-border/50 bg-background/50 p-4">
        <p className="text-sm font-semibold">{t("workflowBuilder.datePicker.calendarConstraints")}</p>

        <label className="flex items-start gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <Checkbox
            checked={config.disablePastDates !== false}
            onCheckedChange={(checked) => onChange({ disablePastDates: checked === true })}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">{t("workflowBuilder.datePicker.disablePastDates")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("workflowBuilder.datePicker.disablePastDatesHint")}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <Checkbox
            checked={config.disableCompanyHolidays === true}
            onCheckedChange={(checked) => onChange({ disableCompanyHolidays: checked === true })}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">{t("workflowBuilder.datePicker.disableCompanyHolidays")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("workflowBuilder.datePicker.disableCompanyHolidaysHint")}
            </span>
          </span>
        </label>

        {config.disableCompanyHolidays === true && (
          <div className="space-y-2 ps-1">
            <Label className="text-sm font-medium">{t("workflowBuilder.datePicker.holidayBehavior")}</Label>
            <Select
              value={config.holidayBehavior === "warning" ? "warning" : "disable"}
              onValueChange={(value) => onChange({ holidayBehavior: value })}
            >
              <SelectTrigger className="rounded-xl bg-background/80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="disable">{t("workflowBuilder.datePicker.holidayBehaviorDisable")}</SelectItem>
                <SelectItem value="warning">{t("workflowBuilder.datePicker.holidayBehaviorWarning")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <label className="flex items-start gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <Checkbox
            checked={config.disableClosedWeekdays !== false}
            onCheckedChange={(checked) => onChange({ disableClosedWeekdays: checked === true })}
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium">{t("workflowBuilder.datePicker.disableClosedWeekdays")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("workflowBuilder.datePicker.disableClosedWeekdaysHint")}
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("workflowBuilder.datePicker.preview")}</Label>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.datePicker.loading")}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : constraints ? (
          <DatePickerCalendarPreview constraints={constraints} holidayBehavior={constraintOptions.holidayBehavior} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("workflowBuilder.datePicker.previewUnavailable")}</p>
        )}
      </div>
    </div>
  );
}
