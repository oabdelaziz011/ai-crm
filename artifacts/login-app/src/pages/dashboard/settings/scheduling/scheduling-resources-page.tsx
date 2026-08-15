import { useMemo, useState } from "react";
import { AlertTriangle, CalendarOff, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  ResourceFormDialog,
  type ResourceFormSubmitPayload,
} from "@/components/scheduling/resources/resource-form-dialog";
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
  syncResourceServicesFor,
  useResourceServiceCounts,
} from "@/hooks/scheduling/use-resource-capabilities";
import {
  useCreateSchedulingResource,
  useDeleteSchedulingResource,
  useSchedulingBranches,
  useSchedulingResources,
  useUpdateSchedulingResource,
} from "@/hooks/scheduling/use-scheduling-resources";
import type { SchedulingResource } from "@/lib/scheduling/types";
import { schedulingResourceProfileHref } from "@/config/scheduling-route-registry";
import { nestedSectionHref } from "@/lib/routing";

export function SchedulingResourcesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data: branches = [] } = useSchedulingBranches(companyId);
  const { data: resources = [], isLoading, error } = useSchedulingResources(companyId);
  const resourceIds = useMemo(() => resources.map((resource) => resource.id), [resources]);
  const { counts: serviceCounts, isLoading: countsLoading } = useResourceServiceCounts(
    companyId,
    resourceIds,
  );

  const createResource = useCreateSchedulingResource(companyId);
  const updateResource = useUpdateSchedulingResource(companyId);
  const deleteResource = useDeleteSchedulingResource(companyId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingResource | null>(null);
  const [deleting, setDeleting] = useState<SchedulingResource | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const defaultTimezone = useMemo(
    () => resources[0]?.timezone ?? "UTC",
    [resources],
  );

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (resource: SchedulingResource) => {
    setEditing(resource);
    setModalOpen(true);
  };

  const handleSubmit = async ({ values, serviceIds }: ResourceFormSubmitPayload) => {
    if (!companyId) return;

    const onError = (message: string) => {
      toast({ variant: "destructive", title: t("scheduling.errors.title"), description: message });
    };

    setIsSaving(true);
    try {
      const resourceId = editing
        ? (await updateResource.mutateAsync({ id: editing.id, values })).id
        : (await createResource.mutateAsync(values)).id;

      await syncResourceServicesFor(companyId, resourceId, serviceIds);
      invalidateCapabilityQueries(qc, companyId);

      setModalOpen(false);
      toast({
        title: editing ? t("scheduling.resources.updated") : t("scheduling.resources.created"),
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : t("scheduling.errors.title"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteResource.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        toast({ title: t("scheduling.resources.deleted") });
      },
      onError: (e) =>
        toast({
          variant: "destructive",
          title: t("scheduling.errors.title"),
          description: e.message,
        }),
    });
  };

  return (
    <div className="overflow-hidden border border-border bg-background">
      <div className="p-5 border-b border-border/40 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {t("scheduling.resources.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("scheduling.resources.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button size="sm" onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              {t("scheduling.resources.add")}
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
      ) : resources.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm px-6">
          <CalendarOff className="w-8 h-8 mx-auto mb-3 opacity-50" />
          {t("scheduling.resources.empty")}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {resources.map((resource) => {
            const assignedCount = serviceCounts.get(resource.id) ?? 0;
            return (
              <div
                key={resource.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-muted/10"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={nestedSectionHref(schedulingResourceProfileHref(resource.id))}
                    className="text-sm font-medium hover:text-primary transition-colors truncate block"
                  >
                    {resource.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`scheduling.resources.types.${resource.resource_type}`)}
                    {resource.branches?.name ? ` · ${resource.branches.name}` : ""}
                    {" · "}
                    {t(`scheduling.resources.statuses.${resource.status}`)}
                  </p>
                  <p className="text-xs mt-1 flex items-center gap-1.5">
                    {countsLoading ? (
                      <span className="text-muted-foreground">{t("scheduling.resources.servicesCountLoading")}</span>
                    ) : assignedCount === 0 ? (
                      <span className="text-amber-400/90 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {t("scheduling.resources.noServicesAssigned")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("scheduling.resources.servicesAssignedCount", { count: assignedCount })}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground hidden sm:block">{resource.timezone}</p>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(resource)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleting(resource)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ResourceFormDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        companyId={companyId}
        resource={editing}
        branches={branches}
        defaultTimezone={defaultTimezone}
        canEdit={canEdit}
        isPending={isSaving || createResource.isPending || updateResource.isPending}
        onSubmit={handleSubmit}
      />

      <DeleteDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={t("scheduling.resources.deleteTitle")}
        description={t("scheduling.resources.deleteDescription", {
          name: deleting?.name ?? "",
        })}
        pending={deleteResource.isPending}
      />
    </div>
  );
}
