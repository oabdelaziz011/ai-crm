import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRevokeCompanyFeatureGrant } from "@/hooks/companies/use-company-approval";
import {
  canDirectRevokeEntitlementSource,
  normalizeEntitlementSource,
} from "@/lib/billing/entitlement-display";
import { formatBillingDate } from "@/lib/billing/format";
import type { CompanyEntitlement } from "@/lib/billing/types";

type BillingRevokeFeatureGrantDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  entitlement: CompanyEntitlement | null;
  onSuccess?: () => void;
  onError?: (message: string) => void;
};

export function BillingRevokeFeatureGrantDialog({
  open,
  onOpenChange,
  companyId,
  entitlement,
  onSuccess,
  onError,
}: BillingRevokeFeatureGrantDialogProps) {
  const { t } = useTranslation("common");
  const revokeGrant = useRevokeCompanyFeatureGrant();

  const source = normalizeEntitlementSource(entitlement?.source);
  const allowed = entitlement ? canDirectRevokeEntitlementSource(source) : false;

  const handleSubmit = async () => {
    if (!entitlement || !allowed) {
      onError?.(
        t(
          "billing.entitlements.revokeNotAllowed",
          "This grant source cannot be revoked from Billing.",
        ),
      );
      return;
    }
    try {
      await revokeGrant.mutateAsync({
        companyId,
        featureCode: entitlement.feature_code,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : t("billing.entitlements.revokeFailed", "Could not revoke grant."),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("billing.entitlements.revokeTitle", "Revoke commercial grant")}
          </DialogTitle>
        </DialogHeader>
        {entitlement ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {t(
                "billing.entitlements.revokeDescription",
                "This deactivates the active {{source}} grant for this feature. It does not remove the company package, cancel the subscription, or change trial lifecycle.",
                { source },
              )}
            </p>
            <dl className="space-y-2 rounded-xl border border-white/10 bg-background/40 p-3">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("billing.detail.featureName")}</dt>
                <dd className="font-medium text-end">{entitlement.label}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("billing.entitlements.featureCode", "Code")}</dt>
                <dd className="font-mono text-xs text-end">{entitlement.feature_code}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("billing.detail.featureSource")}</dt>
                <dd className="uppercase text-end">{source}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("billing.entitlements.expiresAt", "Expires")}</dt>
                <dd className="text-end">
                  {entitlement.expires_at
                    ? formatBillingDate(entitlement.expires_at, true)
                    : t("billing.entitlements.indefinite", "No expiration")}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={revokeGrant.isPending}>
            {t("buttons.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={revokeGrant.isPending || !allowed}
          >
            {revokeGrant.isPending
              ? t("billing.common.loading")
              : source === "contract"
                ? t("billing.entitlements.revokeContractConfirm", "Revoke contract grant")
                : t("billing.entitlements.revokeManualConfirm", "Revoke manual grant")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
