import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CapabilityMultiSelect,
  type CapabilitySelectItem,
} from "@/components/scheduling/capabilities/capability-multi-select";
import { useServiceResources } from "@/hooks/scheduling/use-resource-capabilities";
import { useSchedulingResources } from "@/hooks/scheduling/use-scheduling-resources";
import {
  serviceFormSchema,
  type ServiceFormValues,
} from "@/lib/scheduling/validation/service-schemas";
import {
  SCHEDULING_SERVICE_STATUSES,
  type SchedulingService,
} from "@/lib/scheduling/types";

export type ServiceFormSubmitPayload = {
  values: ServiceFormValues;
  resourceIds: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  service?: SchedulingService | null;
  canEdit: boolean;
  isPending: boolean;
  onSubmit: (payload: ServiceFormSubmitPayload) => void;
};

export function ServiceFormDialog({
  open,
  onClose,
  companyId,
  service,
  canEdit,
  isPending,
  onSubmit,
}: Props) {
  const { t } = useTranslation("common");
  const isEdit = Boolean(service);

  const { data: allResources = [], isLoading: resourcesLoading } = useSchedulingResources(companyId);
  const { data: mappedResources = [], isLoading: mappedLoading } = useServiceResources(
    companyId,
    service?.id ?? null,
  );

  const [resourceIds, setResourceIds] = useState<string[]>([]);

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      description: "",
      duration_minutes: 30,
      status: "active",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: service?.name ?? "",
        description: service?.description ?? "",
        duration_minutes: service?.duration_minutes ?? 30,
        status: service?.status ?? "active",
      });
      setResourceIds(isEdit ? mappedResources.map((resource) => resource.id) : []);
    }
  }, [open, service, form, isEdit, mappedResources]);

  const resourceItems = useMemo<CapabilitySelectItem[]>(
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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg border-white/10 bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("scheduling.services.editTitle")
              : t("scheduling.services.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => onSubmit({ values, resourceIds }))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="service-name">{t("scheduling.services.fields.name")}</Label>
            <Input
              id="service-name"
              disabled={!canEdit}
              {...form.register("name")}
              className="bg-background/50 border-white/10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="service-duration">
                {t("scheduling.services.fields.duration")}
              </Label>
              <Input
                id="service-duration"
                type="number"
                min={5}
                disabled={!canEdit}
                {...form.register("duration_minutes")}
                className="bg-background/50 border-white/10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-status">{t("scheduling.services.fields.status")}</Label>
              <select
                id="service-status"
                disabled={!canEdit}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                {...form.register("status")}
              >
                {SCHEDULING_SERVICE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`scheduling.services.statuses.${status}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-description">
              {t("scheduling.services.fields.description")}
            </Label>
            <textarea
              id="service-description"
              disabled={!canEdit}
              rows={3}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm resize-none"
              {...form.register("description")}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-background/20 p-3 space-y-3">
            <CapabilityMultiSelect
              label={t("scheduling.capabilities.serviceResourcesTitle")}
              items={resourceItems}
              selectedIds={resourceIds}
              onChange={setResourceIds}
              disabled={!canEdit || isPending}
              isLoading={resourcesLoading || (isEdit && mappedLoading)}
              emptyMessage={t("scheduling.capabilities.noResourcesAvailable")}
            />
            {resourceIds.length === 0 && (
              <p className="text-xs text-amber-400/90 flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t("scheduling.capabilities.serviceNoResourcesWarning")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="border-white/10">
              {t("buttons.cancel")}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {isEdit ? t("buttons.save") : t("buttons.create")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
