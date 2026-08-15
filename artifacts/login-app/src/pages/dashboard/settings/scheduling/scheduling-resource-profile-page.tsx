import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { CapabilityMappingPanel } from "@/components/scheduling/capabilities/capability-mapping-panel";
import {
  ResourceFormDialog,
  type ResourceFormSubmitPayload,
} from "@/components/scheduling/resources/resource-form-dialog";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import { DashboardErrorBanner, DashboardPageFallback } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  invalidateCapabilityQueries,
  syncResourceServicesFor,
  useResourceCapabilities,
  useSyncResourceServices,
} from "@/hooks/scheduling/use-resource-capabilities";
import {
  useSchedulingBranches,
  useSchedulingResource,
  useUpdateSchedulingResource,
} from "@/hooks/scheduling/use-scheduling-resources";
import { useSchedulingServices } from "@/hooks/scheduling/use-scheduling-services";
import { nestedSectionHref } from "@/lib/routing";

export function SchedulingResourceProfilePage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();
  const [, params] = useRoute("/resources/:resourceId");
  const resourceId = params?.resourceId ?? null;

  const { data: resource, isLoading, error } = useSchedulingResource(companyId, resourceId);
  const { data: branches = [] } = useSchedulingBranches(companyId);
  const { data: allServices = [], isLoading: servicesLoading } = useSchedulingServices(companyId);
  const { data: mappedServices = [], isLoading: mappedLoading } = useResourceCapabilities(
    companyId,
    resourceId,
  );
  const updateResource = useUpdateSchedulingResource(companyId);
  const syncServices = useSyncResourceServices(companyId, resourceId);

  const [editOpen, setEditOpen] = useState(false);

  const serviceItems = useMemo(
    () =>
      allServices.map((service) => ({
        id: service.id,
        label: service.name,
        meta: t("scheduling.capabilities.serviceMeta", {
          minutes: service.duration_minutes,
          status: t(`scheduling.services.statuses.${service.status}`),
        }),
      })),
    [allServices, t],
  );

  const selectedServiceIds = useMemo(() => mappedServices.map((s) => s.id), [mappedServices]);

  if (isLoading) {
    return <DashboardPageFallback />;
  }

  if (error || !resource) {
    return (
      <DashboardErrorBanner
        message={error?.message ?? t("scheduling.resources.notFound")}
      />
    );
  }

  const handleSaveDetails = async ({ values, serviceIds }: ResourceFormSubmitPayload) => {
    if (!companyId) return;
    try {
      await updateResource.mutateAsync({ id: resource.id, values });
      await syncResourceServicesFor(companyId, resource.id, serviceIds);
      invalidateCapabilityQueries(qc, companyId);
      setEditOpen(false);
      toast({ title: t("scheduling.resources.updated") });
    } catch (e) {
      toast({
        variant: "destructive",
        title: t("scheduling.errors.title"),
        description: e instanceof Error ? e.message : t("scheduling.errors.title"),
      });
    }
  };

  const handleSaveServices = (serviceIds: string[]) => {
    syncServices.mutate(serviceIds, {
      onSuccess: () => toast({ title: t("scheduling.capabilities.resourceSaved") }),
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
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-2 -ms-2">
          <Link href={nestedSectionHref("/resources")}>
            <ArrowLeft className="w-4 h-4" />
            {t("scheduling.resources.backToList")}
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{resource.name}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`scheduling.resources.types.${resource.resource_type}`)}
            {resource.branches?.name ? ` · ${resource.branches.name}` : ""}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="border-border/60" onClick={() => setEditOpen(true)}>
            {t("scheduling.resources.editDetails")}
          </Button>
        )}
      </div>

      <Tabs defaultValue="services">
        <TabsList className="bg-transparent border-b border-border/60 rounded-none w-full justify-start h-auto p-0 gap-0">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            {t("scheduling.resources.tabs.overview")}
          </TabsTrigger>
          <TabsTrigger
            value="services"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            {t("scheduling.resources.tabs.services")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Info label={t("scheduling.resources.fields.status")} value={t(`scheduling.resources.statuses.${resource.status}`)} />
            <Info label={t("scheduling.resources.fields.timezone")} value={resource.timezone} />
            <Info label={t("scheduling.resources.fields.type")} value={t(`scheduling.resources.types.${resource.resource_type}`)} />
            <Info label={t("scheduling.resources.fields.branch")} value={resource.branches?.name ?? t("scheduling.resources.noBranch")} />
          </div>
          {resource.description && (
            <Info label={t("scheduling.resources.fields.description")} value={resource.description} />
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <CapabilityMappingPanel
            title={t("scheduling.capabilities.resourceServicesTitle")}
            subtitle={t("scheduling.capabilities.resourceServicesSubtitle")}
            items={serviceItems}
            selectedIds={selectedServiceIds}
            isLoading={servicesLoading || mappedLoading}
            canEdit={canEdit}
            isSaving={syncServices.isPending}
            emptyMessage={t("scheduling.capabilities.noServicesAvailable")}
            onSave={handleSaveServices}
          />
        </TabsContent>
      </Tabs>

      <ResourceFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        companyId={companyId}
        resource={resource}
        branches={branches}
        defaultTimezone={resource.timezone}
        canEdit={canEdit}
        isPending={updateResource.isPending}
        onSubmit={handleSaveDetails}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
