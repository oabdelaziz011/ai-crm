import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPANY_DEFAULT_CURRENCY,
  SERVICE_PRICING_CURRENCIES,
  type SchedulingPricingRuleType,
} from "@/lib/scheduling/types";
import type { PricingRuleFormValues } from "@/lib/scheduling/validation/service-schemas";
import { cn } from "@/lib/utils";

type Props = {
  rules: PricingRuleFormValues[];
  types: SchedulingPricingRuleType[];
  typesLoading?: boolean;
  typesError?: boolean;
  companyCurrency: string;
  canEdit: boolean;
  errorMessage?: string | null;
  onChange: (rules: PricingRuleFormValues[]) => void;
};

function emptyRule(types: SchedulingPricingRuleType[], makeDefault: boolean): PricingRuleFormValues {
  return {
    typeId: types[0]?.id ?? "",
    price: 1,
    currency: COMPANY_DEFAULT_CURRENCY,
    durationMinutes: 30,
    isDefault: makeDefault,
    description: null,
  };
}

export function ServicePricingRulesEditor({
  rules,
  types,
  typesLoading = false,
  typesError = false,
  companyCurrency,
  canEdit,
  errorMessage,
  onChange,
}: Props) {
  const { t } = useTranslation("common");

  const updateRule = (index: number, patch: Partial<PricingRuleFormValues>) => {
    const next = rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
    if (patch.isDefault === true) {
      onChange(next.map((rule, i) => ({ ...rule, isDefault: i === index })));
      return;
    }
    onChange(next);
  };

  const removeRule = (index: number) => {
    const next = rules.filter((_, i) => i !== index);
    if (next.length && !next.some((rule) => rule.isDefault)) {
      next[0] = { ...next[0]!, isDefault: true };
    }
    onChange(next);
  };

  const addRule = () => {
    const used = new Set(rules.map((rule) => rule.typeId));
    const available = types.find((type) => !used.has(type.id)) ?? types[0];
    if (!available) return;
    onChange([
      ...rules,
      {
        ...emptyRule(types, rules.length === 0),
        typeId: available.id,
      },
    ]);
  };

  const typesUnavailable = !typesLoading && (typesError || types.length === 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">
            {t("scheduling.services.pricing.title", { defaultValue: "Pricing Rules" })}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t("scheduling.services.pricing.subtitle", {
              defaultValue: "Multiple prices per service. Booking copies the selected or default rule.",
            })}
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={addRule}
            disabled={!types.length}
          >
            <Plus className="size-3.5" />
            {t("scheduling.services.pricing.add", { defaultValue: "Add Pricing Rule" })}
          </Button>
        )}
      </div>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {typesLoading ? (
        <p className="rounded-md border border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("scheduling.services.pricing.typesLoading", {
            defaultValue: "Loading pricing rule types…",
          })}
        </p>
      ) : null}

      {typesUnavailable ? (
        <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
          {t("scheduling.services.pricing.typesEmpty", {
            defaultValue:
              "No pricing rule types available. Seed types (New, Follow Up, Consultation, Emergency, VIP) or add them in configuration.",
          })}
        </p>
      ) : null}

      {!typesLoading && !typesUnavailable ? (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">
                  {t("scheduling.services.pricing.columns.type", { defaultValue: "Type" })}
                </th>
                <th className="px-2 py-2">
                  {t("scheduling.services.pricing.columns.price", { defaultValue: "Price" })}
                </th>
                <th className="px-2 py-2">
                  {t("scheduling.services.pricing.columns.currency", { defaultValue: "Currency" })}
                </th>
                <th className="px-2 py-2">
                  {t("scheduling.services.pricing.columns.duration", { defaultValue: "Duration" })}
                </th>
                <th className="px-2 py-2 text-center">
                  {t("scheduling.services.pricing.columns.default", { defaultValue: "Default" })}
                </th>
                <th className="px-2 py-2 w-12">
                  {t("scheduling.services.pricing.columns.actions", { defaultValue: "Actions" })}
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("scheduling.services.pricing.empty", { defaultValue: "No pricing rules yet." })}
                  </td>
                </tr>
              ) : (
                rules.map((rule, index) => (
                  <tr key={rule.id ?? `new-${index}`} className="border-b border-border/40 align-top">
                    <td className="px-2 py-2">
                      <Select
                        value={rule.typeId || undefined}
                        disabled={!canEdit}
                        onValueChange={(value) => updateRule(index, { typeId: value })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue
                            placeholder={t("scheduling.services.pricing.typePlaceholder", {
                              defaultValue: "Select type",
                            })}
                          />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {types.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="mt-1.5 h-8 text-xs"
                        disabled={!canEdit}
                        placeholder={t("scheduling.services.pricing.descriptionOptional", {
                          defaultValue: "Description (optional)",
                        })}
                        value={rule.description ?? ""}
                        onChange={(e) => updateRule(index, { description: e.target.value || null })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        disabled={!canEdit}
                        className="h-9"
                        value={rule.price}
                        onChange={(e) => updateRule(index, { price: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Select
                        value={rule.currency}
                        disabled={!canEdit}
                        onValueChange={(value) => updateRule(index, { currency: value })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value={COMPANY_DEFAULT_CURRENCY}>
                            {t("scheduling.services.pricing.companyDefaultCurrency", {
                              defaultValue: "Company Default ({{currency}})",
                              currency: companyCurrency,
                            })}
                          </SelectItem>
                          {SERVICE_PRICING_CURRENCIES.map((code) => (
                            <SelectItem key={code} value={code}>
                              {code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={1}
                        disabled={!canEdit}
                        className="h-9"
                        value={rule.durationMinutes}
                        onChange={(e) =>
                          updateRule(index, { durationMinutes: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex justify-center pt-2">
                        <Checkbox
                          checked={rule.isDefault}
                          disabled={!canEdit}
                          onCheckedChange={(checked) =>
                            updateRule(index, { isDefault: checked === true })
                          }
                          aria-label={t("scheduling.services.pricing.columns.default", {
                            defaultValue: "Default",
                          })}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={cn("size-8", !canEdit && "opacity-50")}
                        disabled={!canEdit || rules.length <= 1}
                        onClick={() => removeRule(index)}
                        aria-label={t("buttons.delete", { defaultValue: "Delete" })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function createInitialPricingRule(
  types: SchedulingPricingRuleType[],
): PricingRuleFormValues {
  return emptyRule(types, true);
}
