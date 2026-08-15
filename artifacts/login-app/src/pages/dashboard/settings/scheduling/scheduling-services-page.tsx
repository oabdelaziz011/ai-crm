import { useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  ServiceFormDialog,
  type ServiceFormSubmitPayload,
} from "@/components/scheduling/services/service-form-dialog";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import {
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  invalidateCapabilityQueries,
  syncServiceResourcesFor,
} from "@/hooks/scheduling/use-resource-capabilities";
import { useServicesBranchMap } from "@/lib/company/branches/hooks";
import {
  useCreateSchedulingService,
  useDeleteSchedulingService,
  useSchedulingServices,
  useUpdateSchedulingService,
} from "@/hooks/scheduling/use-scheduling-services";
import { useSaveServicePricingRules } from "@/hooks/scheduling/use-service-pricing";
import { schedulingServiceProfileHref } from "@/config/scheduling-route-registry";
import { nestedSectionHref } from "@/lib/routing";
import type { SchedulingService } from "@/lib/scheduling/types";

export function SchedulingServicesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data: services = [], isLoading, error } = useSchedulingServices(companyId);
  const { data: serviceBranchMap = {} } = useServicesBranchMap(companyId);
  const createService = useCreateSchedulingService(companyId);
  const updateService = useUpdateSchedulingService(companyId);
  const deleteService = useDeleteSchedulingService(companyId);
  const savePricingRules = useSaveServicePricingRules(companyId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingService | null>(null);
  const [deleting, setDeleting] = useState<SchedulingService | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async ({ values, resourceIds, pricingRules }: ServiceFormSubmitPayload) => {
    if (!companyId) return;

    const onError = (message: string) =>
      toast({ variant: "destructive", title: t("scheduling.errors.title"), description: message });

    setIsSaving(true);
    try {
      const serviceId = editing
        ? (await updateService.mutateAsync({ id: editing.id, values })).id
        : (
            await createService.mutateAsync({
              ...values,
              pricingRules,
            })
          ).id;

      // Create already persists rules via the catalog; edit re-syncs here.
      if (editing) {
        await savePricingRules.mutateAsync({ serviceId, rules: pricingRules });
      }

      await syncServiceResourcesFor(companyId, serviceId, resourceIds);
      invalidateCapabilityQueries(qc, companyId);

      setModalOpen(false);
      toast({
        title: editing ? t("scheduling.services.updated") : t("scheduling.services.created"),
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : t("scheduling.errors.title"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="overflow-hidden border border-border bg-background">
      <div className="p-5 border-b border-border/40 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            {t("scheduling.services.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("scheduling.services.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              {t("scheduling.services.add")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-5">
          <DashboardErrorBanner message={error.message} />
        </div>
      )}

      {isLoading ? (
        <DashboardTableSkeleton />
      ) : services.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm px-6">
          {t("scheduling.services.empty")}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex items-center gap-4 px-6 py-4 hover:bg-muted/10"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={nestedSectionHref(schedulingServiceProfileHref(service.id))}
                  className="text-sm font-medium hover:text-primary transition-colors truncate block"
                >
                  {service.name}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("scheduling.services.durationLabel", { minutes: service.duration_minutes })}
                  {" · "}
                  {t("scheduling.services.priceLabel", {
                    amount: ((service.price_cents ?? 0) / 100).toFixed(2),
                    currency: service.currency ?? "USD",
                  })}
                  {" · "}
                  {t(`scheduling.services.statuses.${service.status}`)}
                  {(serviceBranchMap[service.id]?.length ?? 0) > 0 && (
                    <>
                      {" · "}
                      {t("branches.services.availableAt", {
                        branches: (serviceBranchMap[service.id] ?? [])
                          .map((branch) => branch.name)
                          .join(", "),
                      })}
                    </>
                  )}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditing(service);
                      setModalOpen(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setDeleting(service)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ServiceFormDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        companyId={companyId}
        service={editing}
        canEdit={canEdit}
        isPending={isSaving || createService.isPending || updateService.isPending}
        onSubmit={handleSubmit}
      />

      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          deleteService.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              toast({ title: t("scheduling.services.deleted") });
            },
          });
        }}
        title={t("scheduling.services.deleteTitle")}
        description={t("scheduling.services.deleteDescription", { name: deleting?.name ?? "" })}
        pending={deleteService.isPending}
      />
    </div>
  );
}
