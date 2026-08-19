import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useCompanyEditAccess } from "@/components/company/layout/company-route-guard";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardPageFallback,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BranchCard } from "@/lib/company/branches/components";
import { BranchFormDialog } from "@/lib/company/branches/components/branch-form-dialog";
import {
  formatBranchError,
  useBranchesInfinite,
  useCreateBranch,
  useDeactivateBranch,
  useDeleteBranch,
  useUpdateBranch,
} from "@/lib/company/branches/hooks";
import type { BranchFormSchema } from "@/lib/company/branches/validators";
import type { BranchWithStats } from "@/lib/company/branches/types";
import { branchDetailHref } from "@/config/company-route-registry";
import { nestedSectionHref } from "@/lib/routing";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BranchManagementError } from "@/lib/company/branches/services";
import { useCompanyResourceOccupancy } from "@/hooks/billing/use-company-resource-occupancy";
import { formatResourceOccupancy, occupancyAllowsCreate } from "@/lib/billing/company-resource-limits";

export function BranchesListPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { company } = useAuth();
  const companyId = company?.id ?? null;
  const canEdit = useCompanyEditAccess();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BranchWithStats | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BranchWithStats | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filter = useMemo(() => ({ search }), [search]);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBranchesInfinite(companyId, filter);

  const occupancyQuery = useCompanyResourceOccupancy(companyId);
  const branchOccupancy = occupancyQuery.data?.branches ?? null;
  const canAddBranch = occupancyAllowsCreate(branchOccupancy);
  const createBranch = useCreateBranch(companyId);
  const updateBranch = useUpdateBranch(companyId, editing?.id ?? null);
  const deleteBranch = useDeleteBranch(companyId);
  const deactivateBranch = useDeactivateBranch(companyId);

  const branches = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const handleSubmit = async (values: BranchFormSchema) => {
    setIsSaving(true);
    try {
      if (editing) {
        await updateBranch.mutateAsync(values);
        toast({ title: t("branches.updated") });
      } else {
        await createBranch.mutateAsync(values);
        toast({ title: t("branches.created") });
      }
      setModalOpen(false);
      setEditing(null);
    } catch (submitError) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(submitError),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBranch.mutateAsync(deleteTarget.id);
      toast({ title: t("branches.deleted") });
      setDeleteTarget(null);
    } catch (deleteError) {
      if (deleteError instanceof BranchManagementError && deleteError.code === "has_dependencies") {
        toast({
          variant: "destructive",
          title: t("branches.errors.cannotDeleteTitle"),
          description: t("branches.errors.deactivateInstead"),
        });
      } else {
        toast({
          variant: "destructive",
          title: t("branches.errors.title"),
          description: formatBranchError(deleteError),
        });
      }
    }
  };

  const handleDeactivateFromDialog = async () => {
    if (!deleteTarget) return;
    try {
      await deactivateBranch.mutateAsync(deleteTarget.id);
      toast({ title: t("branches.deactivated") });
      setDeleteTarget(null);
    } catch (deactivateError) {
      toast({
        variant: "destructive",
        title: t("branches.errors.title"),
        description: formatBranchError(deactivateError),
      });
    }
  };

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error) {
    return <DashboardErrorBanner message={error.message} />;
  }

  return (
    <>
      <DashboardCard className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold">{t("branches.managementTitle")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("branches.managementSubtitle")}</p>
            {branchOccupancy ? (
              <p className="text-sm text-muted-foreground mt-2">
                {t("branches.occupancy.label")}:{" "}
                {formatResourceOccupancy(
                  branchOccupancy.current_count,
                  branchOccupancy.max_allowed,
                  t("branches.occupancy.unlimited"),
                )}
                {branchOccupancy.is_over_limit ? ` — ${t("branches.occupancy.overLimit")}` : null}
              </p>
            ) : null}
          </div>
          {canEdit && (
            <Button
              size="sm"
              className="gap-2 shrink-0"
              disabled={!canAddBranch}
              title={!canAddBranch ? t("branches.occupancy.overLimit") : undefined}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              {t("branches.actions.addBranch")}
            </Button>
          )}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("branches.searchPlaceholder")}
            className="pl-9 bg-background/50 border-white/10"
          />
        </div>

        {branches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("branches.empty")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {branches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                onManage={() => setLocation(nestedSectionHref(branchDetailHref(branch.id)))}
                onEdit={
                  canEdit
                    ? () => {
                        setEditing(branch);
                        setModalOpen(true);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? t("common.loading") : t("branches.loadMore")}
            </Button>
          </div>
        )}
      </DashboardCard>

      <BranchFormDialog
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        branch={editing}
        onSubmit={handleSubmit}
        isSaving={isSaving}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("branches.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("branches.deleteConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeactivateFromDialog()}>
              {t("branches.actions.deactivate")}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-destructive text-destructive-foreground">
              {t("buttons.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
