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

export function BillingPackagesPage() {
  const { t } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = canViewBilling(hasPermission, isSuperAdmin);
  const canEdit = canEditBilling(hasPermission, isSuperAdmin);
  const { data: packages = [], isLoading, error } = useCommercialPackages(canView);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const rows = useMemo(() => packages, [packages]);

  if (!canView) {
    return <DashboardErrorBanner message={t("billing.packages.accessDenied", "Billing access required")} />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("billing.packages.title", "Packages")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              "billing.packages.subtitle",
              "Sellable feature bundles. Packages provision existing feature grants — they are not a second entitlement system.",
            )}
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
            {t("billing.packages.create", "Create package")}
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
            {t("billing.packages.empty", "No packages yet")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.packages.columns.package", "Package")}</TableHead>
                <TableHead>{t("billing.packages.columns.code", "Code")}</TableHead>
                <TableHead>{t("billing.packages.columns.pricing", "Pricing")}</TableHead>
                <TableHead>{t("billing.packages.columns.monthly", "Monthly list")}</TableHead>
                <TableHead>{t("billing.packages.columns.yearly", "Annual list")}</TableHead>
                <TableHead>{t("billing.packages.columns.status", "Status")}</TableHead>
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
                const prices = formatPackageMonthlyAndYearly(pkg);
                return (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{pkg.display_name || pkg.name}</span>
                      {pkg.is_highlighted ? (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Sparkles className="size-3" />
                          {t("billing.packages.highlighted", "Featured")}
                        </Badge>
                      ) : null}
                    </div>
                    {pkg.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{pkg.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{pkg.code}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {mode === "custom"
                        ? t("billing.packages.pricingMode.customShort", "Custom")
                        : mode === "free"
                          ? t("billing.packages.pricingMode.free", "Free")
                          : t("billing.packages.pricingMode.fixedShort", "Fixed")}
                    </Badge>
                  </TableCell>
                  <TableCell>{prices.monthly}</TableCell>
                  <TableCell>{prices.yearly}</TableCell>
                  <TableCell>
                    <Badge variant={pkg.is_active ? "default" : "outline"}>
                      {pkg.is_active
                        ? t("billing.packages.active", "Active")
                        : t("billing.packages.inactive", "Inactive")}
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
                        {t("billing.packages.edit", "Edit")}
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
