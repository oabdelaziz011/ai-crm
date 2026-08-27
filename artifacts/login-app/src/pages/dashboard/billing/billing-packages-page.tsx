import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Pencil, Plus, Sparkles } from "lucide-react";
import { DashboardCard, DashboardErrorBanner, DashboardTableSkeleton } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommercialPackageEditorDialog } from "@/components/billing/dialogs/commercial-package-editor-dialog";
import { useCommercialPackages } from "@/hooks/billing/use-commercial-packages";
import { useAuthUser } from "@/hooks/use-rbac";
import { canEditBilling, canViewBilling } from "@/lib/billing/billing-permissions";
import { formatPackageMonthlyAndYearly, normalizePackagePricingMode } from "@/lib/billing/package-pricing";
import type { Plan } from "@/lib/types";

function packageDisplayName(
  t: (key: string, options?: { defaultValue?: string }) => string,
  pkg: Plan,
): string {
  const code = pkg.code?.trim().toLowerCase();
  if (code) {
    return t(`companies.commercial.packageNames.${code}`, {
      defaultValue: pkg.display_name || pkg.name || code,
    });
  }
  return pkg.display_name || pkg.name || "—";
}

export function BillingPackagesPage() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBilling(hasPermission, isSuperAdmin);
  const canEdit = canEditBilling(hasPermission, isSuperAdmin);
  const { data: packages = [], isLoading, error } = useCommercialPackages(canView);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const rows = useMemo(() => packages, [packages]);
  const priceLabels = useMemo(
    () => ({
      free: t("billing.packages.pricingMode.free"),
      custom: t("billing.packages.pricingMode.customShort"),
    }),
    [t],
  );

  if (!canView) {
    return <DashboardErrorBanner message={t("billing.packages.accessDenied")} />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="text-start">
          <h1 className="text-xl font-semibold tracking-tight">
            {t("billing.packages.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("billing.packages.subtitle")}
          </p>
        </div>
        {canEdit ? (
          <Button
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("billing.packages.create")}
          </Button>
        ) : null}
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <DashboardCard className="overflow-hidden">
        {isLoading ? (
          <DashboardTableSkeleton rows={4} />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Package className="size-8 opacity-50" />
            {t("billing.packages.empty")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">{t("billing.packages.columns.package")}</TableHead>
                <TableHead className="text-start">{t("billing.packages.columns.code")}</TableHead>
                <TableHead className="text-start">{t("billing.packages.columns.pricing")}</TableHead>
                <TableHead className="text-start">{t("billing.packages.columns.monthly")}</TableHead>
                <TableHead className="text-start">{t("billing.packages.columns.yearly")}</TableHead>
                <TableHead className="text-start">{t("billing.packages.columns.status")}</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((pkg) => {
                const mode = normalizePackagePricingMode(
                  pkg.pricing_mode,
                  pkg.price_monthly,
                  pkg.price_yearly,
                );
                const prices = formatPackageMonthlyAndYearly(pkg, undefined, priceLabels);
                return (
                <TableRow key={pkg.id}>
                  <TableCell className="text-start">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{packageDisplayName(t, pkg)}</span>
                      {pkg.is_highlighted ? (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Sparkles className="size-3" />
                          {t("billing.packages.highlighted")}
                        </Badge>
                      ) : null}
                    </div>
                    {pkg.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{pkg.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-start font-mono text-xs">{pkg.code}</TableCell>
                  <TableCell className="text-start">
                    <Badge variant="outline" className="text-[10px]">
                      {mode === "custom"
                        ? t("billing.packages.pricingMode.customShort")
                        : mode === "free"
                          ? t("billing.packages.pricingMode.free")
                          : t("billing.packages.pricingMode.fixedShort")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-start">{prices.monthly}</TableCell>
                  <TableCell className="text-start">{prices.yearly}</TableCell>
                  <TableCell className="text-start">
                    <Badge variant={pkg.is_active ? "default" : "outline"}>
                      {pkg.is_active
                        ? t("billing.packages.active")
                        : t("billing.packages.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() => {
                          setEditing(pkg);
                          setEditorOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        {t("billing.packages.edit")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DashboardCard>

      <CommercialPackageEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        packageRow={editing}
      />
    </div>
  );
}
