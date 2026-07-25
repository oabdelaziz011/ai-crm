import { useState } from "react";
import { Briefcase, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { ServiceFormDialog } from "@/components/scheduling/services/service-form-dialog";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSchedulingService,
  useDeleteSchedulingService,
  useSchedulingServices,
  useUpdateSchedulingService,
} from "@/hooks/scheduling/use-scheduling-services";
import { schedulingServiceProfileHref } from "@/config/scheduling-route-registry";
import { nestedSectionHref } from "@/lib/routing";
import type { SchedulingService } from "@/lib/scheduling/types";
import type { ServiceFormValues } from "@/lib/scheduling/validation/service-schemas";

export function SchedulingServicesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data: services = [], isLoading, error } = useSchedulingServices(companyId);
  const createService = useCreateSchedulingService(companyId);
  const updateService = useUpdateSchedulingService(companyId);
  const deleteService = useDeleteSchedulingService(companyId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingService | null>(null);
  const [deleting, setDeleting] = useState<SchedulingService | null>(null);

  const handleSubmit = (values: ServiceFormValues) => {
    const onError = (message: string) =>
      toast({ variant: "destructive", title: t("scheduling.errors.title"), description: message });

    if (editing) {
      updateService.mutate(
        { id: editing.id, values },
        {
          onSuccess: () => {
            setModalOpen(false);
            toast({ title: t("scheduling.services.updated") });
          },
          onError: (e) => onError(e.message),
        },
      );
      return;
    }

    createService.mutate(values, {
      onSuccess: () => {
        setModalOpen(false);
        toast({ title: t("scheduling.services.created") });
      },
      onError: (e) => onError(e.message),
    });
  };

  return (
    <DashboardCard className="overflow-hidden">
      <div className="p-5 border-b border-white/5 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            {t("scheduling.services.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("scheduling.services.subtitle")}</p>
        </div>
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
        <div className="divide-y divide-white/5">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02]"
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
                  {t(`scheduling.services.statuses.${service.status}`)}
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
        service={editing}
        canEdit={canEdit}
        isPending={createService.isPending || updateService.isPending}
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
    </DashboardCard>
  );
}
