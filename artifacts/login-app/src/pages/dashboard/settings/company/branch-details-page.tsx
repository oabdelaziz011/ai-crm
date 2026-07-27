import { useState } from "react";
import { ArrowLeft, Building2, MapPin, Mail, Phone } from "lucide-react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useCompanyEditAccess } from "@/components/company/layout/company-route-guard";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardPageFallback,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BranchFormDialog } from "@/lib/company/branches/components/branch-form-dialog";
import {
  formatBranchError,
  useBranch,
  useDeactivateBranch,
  useUpdateBranch,
} from "@/lib/company/branches/hooks";
import type { BranchFormSchema } from "@/lib/company/branches/validators";
import { nestedSectionHref } from "@/lib/routing";

export function BranchDetailsPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const canEdit = useCompanyEditAccess();
  const [, params] = useRoute("/branches/:branchId");
  const branchId = params?.branchId ?? null;

  const { data: branch, isLoading, error } = useBranch(companyId, branchId);
  const updateBranch = useUpdateBranch(companyId, branchId);
  const deactivateBranch = useDeactivateBranch(companyId);

  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error || !branch) {
    return (
      <DashboardErrorBanner message={error?.message ?? t("branches.notFound")} />
    );
  }

  const handleSave = async (values: BranchFormSchema) => {
    setIsSaving(true);
    try {
      await updateBranch.mutateAsync(values);
      toast({ title: t("branches.updated") });
      setEditOpen(false);
    } catch (saveError) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(saveError),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateBranch.mutateAsync(branch.id);
      toast({ title: t("branches.deactivated") });
    } catch (deactivateError) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(deactivateError),
      });
    }
  };

  const addressParts = [
    branch.address_line1,
    branch.city,
    branch.state,
    branch.postal_code,
    branch.country,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={nestedSectionHref("/branches")}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("branches.actions.backToList")}
          </Button>
        </Link>
      </div>

      <DashboardCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">{branch.name}</h2>
              {branch.is_primary && (
                <Badge variant="secondary">{t("branches.primaryBadge")}</Badge>
              )}
              <Badge variant={branch.status === "active" ? "default" : "outline"} className="capitalize">
                {t(`branches.statuses.${branch.status}`)}
              </Badge>
            </div>
            {branch.code && (
              <p className="text-sm text-muted-foreground font-mono mt-1">{branch.code}</p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" className="border-white/10" onClick={() => setEditOpen(true)}>
                {t("buttons.edit")}
              </Button>
              {branch.status === "active" && (
                <Button variant="destructive" onClick={() => void handleDeactivate()}>
                  {t("branches.actions.deactivate")}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {addressParts.length > 0 && (
            <div className="p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {t("branches.form.address")}
              </p>
              <p className="text-sm">{addressParts.join(", ")}</p>
            </div>
          )}
          {branch.phone && (
            <div className="p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {t("branches.form.phone")}
              </p>
              <p className="text-sm">{branch.phone}</p>
            </div>
          )}
          {branch.email && (
            <div className="p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {t("branches.form.email")}
              </p>
              <p className="text-sm">{branch.email}</p>
            </div>
          )}
          <div className="p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-xs text-muted-foreground mb-1">{t("branches.form.timezone")}</p>
            <p className="text-sm">{branch.timezone}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-2xl font-semibold">{branch.users_count}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("branches.stats.users")}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-2xl font-semibold">{branch.resources_count}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("branches.stats.resources")}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-black/20 border border-white/5">
            <p className="text-2xl font-semibold">{branch.services_count}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("branches.stats.services")}</p>
          </div>
        </div>
      </DashboardCard>

      <BranchFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        branch={branch}
        onSubmit={handleSave}
        isSaving={isSaving}
      />
    </div>
  );
}
