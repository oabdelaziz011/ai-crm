import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSetCompanyFeatureGrant } from "@/hooks/companies/use-company-approval";
import {
  BILLING_COMMERCIAL_GRANT_SOURCES,
  isGrantableCommercialEntitlement,
  type BillingCommercialGrantSource,
} from "@/lib/billing/entitlement-display";
import type { CompanyEntitlement } from "@/lib/billing/types";

type BillingGrantCommercialFeatureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  entitlements: CompanyEntitlement[];
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function BillingGrantCommercialFeatureDialog({
  open,
  onOpenChange,
  companyId,
  entitlements,
  onSuccess,
  onError,
}: BillingGrantCommercialFeatureDialogProps) {
  const { t } = useTranslation("common");
  const setGrant = useSetCompanyFeatureGrant();
  const grantable = useMemo(
    () => entitlements.filter(isGrantableCommercialEntitlement),
    [entitlements],
  );

  const [featureCode, setFeatureCode] = useState("");
  const [source, setSource] = useState<BillingCommercialGrantSource>("manual");
  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [expiresAtLocal, setExpiresAtLocal] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setFeatureCode(grantable[0]?.feature_code ?? "");
    setSource("manual");
    setStartsAtLocal("");
    setExpiresAtLocal("");
    setNotes("");
  }, [open, grantable]);

  const selected = grantable.find((row) => row.feature_code === featureCode) ?? null;

  const validate = (): string | null => {
    if (!selected || !isGrantableCommercialEntitlement(selected)) {
      return t(
        "billing.entitlements.grantFeatureRequired",
        "Select a commercial feature to grant.",
      );
    }
    if (!(BILLING_COMMERCIAL_GRANT_SOURCES as readonly string[]).includes(source)) {
      return t("billing.entitlements.grantSourceInvalid", "Source must be manual or contract.");
    }
    const startsAt = fromDatetimeLocalValue(startsAtLocal);
    const expiresAt = fromDatetimeLocalValue(expiresAtLocal);
    if (startsAtLocal.trim() && !startsAt) {
      return t("billing.entitlements.grantStartsInvalid", "Starts at is not a valid date.");
    }
    if (expiresAtLocal.trim() && !expiresAt) {
      return t("billing.entitlements.grantExpiresInvalid", "Expires at is not a valid date.");
    }
    if (startsAt && expiresAt && new Date(expiresAt).getTime() <= new Date(startsAt).getTime()) {
      return t(
        "billing.entitlements.grantWindowInvalid",
        "Expires at must be after starts at.",
      );
    }
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return t(
        "billing.entitlements.grantExpiresPast",
        "Expires at must be in the future when set.",
      );
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      onError?.(validationError);
      return;
    }
    if (!selected) return;

    try {
      await setGrant.mutateAsync({
        companyId,
        featureCode: selected.feature_code,
        enabled: true,
        source,
        startsAt: fromDatetimeLocalValue(startsAtLocal),
        expiresAt: fromDatetimeLocalValue(expiresAtLocal),
        notes: notes.trim() || null,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t("billing.entitlements.grantFailed", "Could not grant commercial feature."),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("billing.entitlements.grantTitle", "Grant commercial feature")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            "billing.entitlements.grantDescription",
            "Creates a manual or contract grant. Does not assign a package, start a trial, or change subscription lifecycle.",
          )}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">
              {t("billing.entitlements.commercialFeature", "Commercial feature")}
            </label>
            <select
              value={featureCode}
              onChange={(e) => setFeatureCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
              disabled={grantable.length === 0}
            >
              {grantable.length === 0 ? (
                <option value="">
                  {t("billing.entitlements.noGrantableFeatures", "No grantable commercial features")}
                </option>
              ) : (
                grantable.map((row) => (
                  <option key={row.feature_code} value={row.feature_code}>
                    {row.label} ({row.feature_code})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("billing.entitlements.grantSource", "Source")}
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as BillingCommercialGrantSource)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            >
              {BILLING_COMMERCIAL_GRANT_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {t(`billing.detail.featureSources.${value}`, value)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("billing.entitlements.startsAtOptional", "Starts at (optional)")}
            </label>
            <input
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("billing.entitlements.expiresAtOptional", "Expires at (optional)")}
            </label>
            <input
              type="datetime-local"
              value={expiresAtLocal}
              onChange={(e) => setExpiresAtLocal(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">
              {t("billing.entitlements.notesOptional", "Notes (optional)")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setGrant.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={setGrant.isPending || grantable.length === 0}
          >
            {setGrant.isPending
              ? t("billing.common.loading")
              : t("billing.entitlements.grantConfirm", "Grant commercial access")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
