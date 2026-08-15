import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  usePackageFeatures,
  useSetCommercialPackageFeatures,
  useUpsertCommercialPackage,
} from "@/hooks/billing/use-commercial-packages";
import {
  groupPackageFeaturesForEditor,
  type PackageFeatureSelection,
} from "@/lib/billing/package-feature-groups";
import {
  calculateAnnualSavings,
  normalizePackagePricingMode,
  type PackagePricingMode,
} from "@/lib/billing/package-pricing";
import { formatBillingCurrency } from "@/lib/billing/format";
import { supabase } from "@/lib/supabase";
import type { Plan } from "@/lib/types";

type CommercialPackageEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageRow: Plan | null;
};

export function CommercialPackageEditorDialog({
  open,
  onOpenChange,
  packageRow,
}: CommercialPackageEditorDialogProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const upsert = useUpsertCommercialPackage();
  const setFeatures = useSetCommercialPackageFeatures();
  const existingFeatures = usePackageFeatures(packageRow?.id ?? null, open && Boolean(packageRow?.id));

  const catalogQuery = useQuery({
    queryKey: ["billing", "feature-definitions-catalog"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async (): Promise<PackageFeatureSelection[]> => {
      const { data, error } = await supabase
        .from("feature_definitions")
        .select("code, label, category, is_billable, requires_subscription")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as PackageFeatureSelection[];
    },
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingMode, setPricingMode] = useState<PackagePricingMode>("fixed");
  const [priceMonthly, setPriceMonthly] = useState("0");
  const [priceYearly, setPriceYearly] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setCode(packageRow?.code ?? "");
    setName(packageRow?.name ?? "");
    setDisplayName(packageRow?.display_name ?? packageRow?.name ?? "");
    setDescription(packageRow?.description ?? "");
    setPricingMode(
      normalizePackagePricingMode(
        packageRow?.pricing_mode,
        packageRow?.price_monthly,
        packageRow?.price_yearly,
      ),
    );
    setPriceMonthly(String(packageRow?.price_monthly ?? 0));
    setPriceYearly(String(packageRow?.price_yearly ?? 0));
    setIsActive(packageRow?.is_active ?? true);
    setIsHighlighted(packageRow?.is_highlighted ?? false);
  }, [open, packageRow]);

  useEffect(() => {
    if (!open || !packageRow) {
      if (open && !packageRow) setSelected(new Set(["core_crm", "customers"]));
      return;
    }
    if (existingFeatures.data) {
      setSelected(new Set(existingFeatures.data.map((f) => f.feature_code)));
    }
  }, [open, packageRow, existingFeatures.data]);

  const grouped = useMemo(
    () => groupPackageFeaturesForEditor(catalogQuery.data ?? []),
    [catalogQuery.data],
  );

  const savings = useMemo(
    () => calculateAnnualSavings(Number(priceMonthly) || 0, Number(priceYearly) || 0),
    [priceMonthly, priceYearly],
  );

  const priceInputsDisabled = pricingMode === "free";

  const busy = upsert.isPending || setFeatures.isPending;

  const handleSave = async () => {
    try {
      const monthly = pricingMode === "free" ? 0 : Number(priceMonthly) || 0;
      const yearly = pricingMode === "free" ? 0 : Number(priceYearly) || 0;
      const result = await upsert.mutateAsync({
        code,
        name,
        planId: packageRow?.id ?? null,
        displayName,
        description,
        pricingMode,
        priceMonthly: monthly,
        priceYearly: yearly,
        isActive,
        isHighlighted,
      });
      const planId = String(result.id ?? result.plan_id ?? packageRow?.id ?? "");
      if (planId) {
        await setFeatures.mutateAsync({
          planId,
          featureCodes: [...selected],
        });
      }
      toast({
        title: t("billing.packages.saved", "Package saved"),
        description: t(
          "billing.packages.savedHint",
          "Catalog updated. Existing company subscriptions keep their feature snapshot until reassigned. List price changes do not alter entitlements.",
        ),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t("billing.packages.saveFailed", "Could not save package"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {packageRow
              ? t("billing.packages.editTitle", "Edit package")
              : t("billing.packages.createTitle", "Create package")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pkg-code">{t("billing.packages.fields.code", "Code")}</Label>
            <Input id="pkg-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="growth" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-name">{t("billing.packages.fields.name", "Name")}</Label>
            <Input id="pkg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Growth" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pkg-display">{t("billing.packages.fields.displayName", "Display name")}</Label>
            <Input
              id="pkg-display"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pkg-desc">{t("billing.packages.fields.description", "Description")}</Label>
            <Textarea
              id="pkg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("billing.packages.fields.pricingMode", "Pricing mode")}</Label>
            <Select
              value={pricingMode}
              onValueChange={(value) => {
                const mode = normalizePackagePricingMode(value);
                setPricingMode(mode);
                if (mode === "free") {
                  setPriceMonthly("0");
                  setPriceYearly("0");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">
                  {t("billing.packages.pricingMode.fixed", "Fixed list price")}
                </SelectItem>
                <SelectItem value="free">{t("billing.packages.pricingMode.free", "Free")}</SelectItem>
                <SelectItem value="custom">
                  {t("billing.packages.pricingMode.custom", "Custom / Contact sales")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "billing.packages.fields.pricingModeHint",
                "List pricing only. Prices do not grant features — assignment provisions entitlements separately.",
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-monthly">
              {t("billing.packages.fields.monthly", "Monthly list price")}
            </Label>
            <Input
              id="pkg-monthly"
              type="number"
              min={0}
              step="0.01"
              disabled={priceInputsDisabled}
              value={priceMonthly}
              onChange={(e) => setPriceMonthly(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "billing.packages.fields.monthlyHint",
                "Amount per month. Currency comes from billing settings (default_currency).",
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pkg-yearly">
              {t("billing.packages.fields.yearly", "Annual list price")}
            </Label>
            <Input
              id="pkg-yearly"
              type="number"
              min={0}
              step="0.01"
              disabled={priceInputsDisabled}
              value={priceYearly}
              onChange={(e) => setPriceYearly(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "billing.packages.fields.yearlyHint",
                "Annual total billed upfront (not monthly×12). Typically a discounted yearly total.",
              )}
            </p>
            {pricingMode === "fixed" && savings.savings > 0 && savings.savingsPercent != null ? (
              <p className="text-[11px] text-muted-foreground">
                {t("billing.packages.fields.annualSavings", "Annual savings vs 12× monthly")}:{" "}
                {formatBillingCurrency(savings.savings)} (
                {savings.savingsPercent.toFixed(0)}%)
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label htmlFor="pkg-active">{t("billing.packages.fields.active", "Active")}</Label>
            <Switch id="pkg-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <Label htmlFor="pkg-highlight">{t("billing.packages.fields.highlighted", "Highlighted")}</Label>
            <Switch id="pkg-highlight" checked={isHighlighted} onCheckedChange={setIsHighlighted} />
          </div>
        </div>

        <div className="mt-2 space-y-3">
          <p className="text-sm font-medium">
            {t("billing.packages.fields.features", "Included features")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "billing.packages.fields.featuresHint",
              "Packaging only. Runtime access still requires company feature grants (source=package after assign).",
            )}
          </p>
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border p-3">
            {grouped.map((group) => (
              <div key={group.id}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-1.5">
                  {group.features.map((feature) => {
                    const checked = selected.has(feature.code);
                    const isCore =
                      feature.is_billable === false && feature.requires_subscription !== true;
                    return (
                      <label
                        key={feature.code}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            setSelected((prev) => {
                              const copy = new Set(prev);
                              if (next === true) copy.add(feature.code);
                              else copy.delete(feature.code);
                              return copy;
                            });
                          }}
                        />
                        <span className="text-sm">{feature.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{feature.code}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {isCore
                            ? t("billing.packages.fields.coreBadge", "core")
                            : t("billing.packages.fields.commercialBadge", "commercial")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy || !code.trim() || !name.trim()}>
            {busy ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
