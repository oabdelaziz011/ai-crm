import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { CapabilityMappingPanel } from "@/components/scheduling/capabilities/capability-mapping-panel";
import { ServiceFormDialog } from "@/components/scheduling/services/service-form-dialog";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import { DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useServiceResources,
  useSyncServiceResources,
} from "@/hooks/scheduling/use-resource-capabilities";
import { useSchedulingResources } from "@/hooks/scheduling/use-scheduling-resources";
import {
  useSchedulingService,
  useUpdateSchedulingService,
} from "@/hooks/scheduling/use-scheduling-services";
import { nestedSectionHref } from "@/lib/routing";
import type { ServiceFormValues } from "@/lib/scheduling/validation/service-schemas";

export function SchedulingServiceProfilePage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();
  const [, params] = useRoute("/services/:serviceId");
  const serviceId = params?.serviceId ?? null;

  const { data: service, isLoading, error } = useSchedulingService(companyId, serviceId);
  const { data: allResources = [], isLoading: resourcesLoading } = useSchedulingResources(companyId);
  const { data: mappedResources = [], isLoading: mappedLoading } = useServiceResources(
    companyId,
    serviceId,
  );
  const updateService = useUpdateSchedulingService(companyId);
  const syncResources = useSyncServiceResources(companyId, serviceId);

  const [editOpen, setEditOpen] = useState(false);

  const resourceItems = useMemo(
    () =>
      allResources.map((resource) => ({
        id: resource.id,
        label: resource.name,
        meta: t("scheduling.capabilities.resourceMeta", {
          type: t(`scheduling.resources.types.${resource.resource_type}`),
          status: t(`scheduling.resources.statuses.${resource.status}`),
        }),
      })),
    [allResources, t],
  );

  const selectedResourceIds = useMemo(() => mappedResources.map((r) => r.id), [mappedResources]);

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error || !service) {
    return (
      <DashboardErrorBanner message={error?.message ?? t("scheduling.services.notFound")} />
    );
  }

  const handleSaveDetails = (values: ServiceFormValues) => {
    updateService.mutate(
      { id: service.id, values },
      {
        onSuccess: () => {
          setEditOpen(false);
          toast({ title: t("scheduling.services.updated") });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: t("scheduling.errors.title"),
            description: e.message,
          }),
      },
    );
  };

  const handleSaveResources = (resourceIds: string[]) => {
    syncResources.mutate(resourceIds, {
      onSuccess: () => toast({ title: t("scheduling.capabilities.serviceSaved") }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: t("scheduling.errors.title"),
          description: e.message,
        }),
    });
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="gap-2 -ms-2">
        <Link href={nestedSectionHref("/services")}>
          <ArrowLeft className="w-4 h-4" />
          {t("scheduling.services.backToList")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{service.name}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t("scheduling.services.durationLabel", { minutes: service.duration_minutes })}
            {" · "}
            {t(`scheduling.services.statuses.${service.status}`)}
          </p>
          {service.description && (
            <p className="text-sm text-muted-foreground mt-2">{service.description}</p>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="border-white/10" onClick={() => setEditOpen(true)}>
            {t("scheduling.services.editDetails")}
          </Button>
        )}
      </div>

      <CapabilityMappingPanel
        title={t("scheduling.capabilities.serviceResourcesTitle")}
        subtitle={t("scheduling.capabilities.serviceResourcesSubtitle")}
        items={resourceItems}
        selectedIds={selectedResourceIds}
        isLoading={resourcesLoading || mappedLoading}
        canEdit={canEdit}
        isSaving={syncResources.isPending}
        emptyMessage={t("scheduling.capabilities.noResourcesAvailable")}
        onSave={handleSaveResources}
      />

      <ServiceFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        service={service}
        canEdit={canEdit}
        isPending={updateService.isPending}
        onSubmit={handleSaveDetails}
      />
    </div>
  );
}
