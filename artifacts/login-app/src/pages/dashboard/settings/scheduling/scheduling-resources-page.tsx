import { useMemo, useState } from "react";
import { CalendarOff, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { ResourceFormDialog } from "@/components/scheduling/resources/resource-form-dialog";
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
  useCreateSchedulingResource,
  useDeleteSchedulingResource,
  useSchedulingBranches,
  useSchedulingResources,
  useUpdateSchedulingResource,
} from "@/hooks/scheduling/use-scheduling-resources";
import type { SchedulingResource } from "@/lib/scheduling/types";
import type { ResourceFormValues } from "@/lib/scheduling/validation/schemas";
import { schedulingResourceProfileHref } from "@/config/scheduling-route-registry";
import { nestedSectionHref } from "@/lib/routing";

export function SchedulingResourcesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data: branches = [] } = useSchedulingBranches(companyId);
  const { data: resources = [], isLoading, error } = useSchedulingResources(companyId);
  const createResource = useCreateSchedulingResource(companyId);
  const updateResource = useUpdateSchedulingResource(companyId);
  const deleteResource = useDeleteSchedulingResource(companyId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchedulingResource | null>(null);
  const [deleting, setDeleting] = useState<SchedulingResource | null>(null);

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

  const handleSubmit = (values: ResourceFormValues) => {
    const onError = (message: string) => {
      toast({ variant: "destructive", title: t("scheduling.errors.title"), description: message });
    };

    if (editing) {
      updateResource.mutate(
        { id: editing.id, values },
        {
          onSuccess: () => {
            setModalOpen(false);
            toast({ title: t("scheduling.resources.updated") });
          },
          onError: (e) => onError(e.message),
        },
      );
      return;
    }

    createResource.mutate(values, {
      onSuccess: () => {
        setModalOpen(false);
        toast({ title: t("scheduling.resources.created") });
      },
      onError: (e) => onError(e.message),
    });
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
    <DashboardCard className="overflow-hidden">
      <div className="p-5 border-b border-white/5 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {t("scheduling.resources.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{t("scheduling.resources.subtitle")}</p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("scheduling.resources.add")}
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
      ) : resources.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm px-6">
          <CalendarOff className="w-8 h-8 mx-auto mb-3 opacity-50" />
          {t("scheduling.resources.empty")}
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {resources.map((resource) => (
            <div
              key={resource.id}
              className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02]"
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
          ))}
        </div>
      )}

      <ResourceFormDialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        resource={editing}
        branches={branches}
        defaultTimezone={defaultTimezone}
        canEdit={canEdit}
        isPending={createResource.isPending || updateResource.isPending}
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
    </DashboardCard>
  );
}
