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
import { useResourceCapabilities } from "@/hooks/scheduling/use-resource-capabilities";
import { useSchedulingServices } from "@/hooks/scheduling/use-scheduling-services";
import {
  resourceFormSchema,
  type ResourceFormValues,
} from "@/lib/scheduling/validation/schemas";
import {
  SCHEDULING_RESOURCE_STATUSES,
  SCHEDULING_RESOURCE_TYPES,
  type Branch,
  type SchedulingResource,
} from "@/lib/scheduling/types";

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

export type ResourceFormSubmitPayload = {
  values: ResourceFormValues;
  serviceIds: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  resource?: SchedulingResource | null;
  branches: Branch[];
  defaultTimezone?: string;
  canEdit: boolean;
  isPending: boolean;
  onSubmit: (payload: ResourceFormSubmitPayload) => void;
};

export function ResourceFormDialog({
  open,
  onClose,
  companyId,
  resource,
  branches,
  defaultTimezone = "UTC",
  canEdit,
  isPending,
  onSubmit,
}: Props) {
  const { t } = useTranslation("common");
  const isEdit = Boolean(resource);

  const { data: allServices = [], isLoading: servicesLoading } = useSchedulingServices(companyId);
  const { data: mappedServices = [], isLoading: mappedLoading } = useResourceCapabilities(
    companyId,
    resource?.id ?? null,
  );

  const [serviceIds, setServiceIds] = useState<string[]>([]);

  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: "",
      resource_type: "employee",
      branch_id: null,
      status: "active",
      timezone: defaultTimezone,
      description: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: resource?.name ?? "",
        resource_type: resource?.resource_type ?? "employee",
        branch_id: resource?.branch_id ?? null,
        status: resource?.status ?? "active",
        timezone: resource?.timezone ?? defaultTimezone,
        description: resource?.description ?? "",
      });
      setServiceIds(isEdit ? mappedServices.map((service) => service.id) : []);
    }
  }, [open, resource, defaultTimezone, form, isEdit, mappedServices]);

  const serviceItems = useMemo<CapabilitySelectItem[]>(
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

  const handleSubmit = form.handleSubmit((values) => onSubmit({ values, serviceIds }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg border-white/10 bg-card max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("scheduling.resources.editTitle")
              : t("scheduling.resources.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resource-name">{t("scheduling.resources.fields.name")}</Label>
            <Input
              id="resource-name"
              disabled={!canEdit}
              {...form.register("name")}
              className="bg-background/50 border-white/10"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-type">{t("scheduling.resources.fields.type")}</Label>
            <select
              id="resource-type"
              disabled={!canEdit}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
              {...form.register("resource_type")}
            >
              {SCHEDULING_RESOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`scheduling.resources.types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-branch">{t("scheduling.resources.fields.branch")}</Label>
            <select
              id="resource-branch"
              disabled={!canEdit}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
              value={form.watch("branch_id") ?? ""}
              onChange={(e) =>
                form.setValue("branch_id", e.target.value ? e.target.value : null)
              }
            >
              <option value="">{t("scheduling.resources.noBranch")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="resource-status">{t("scheduling.resources.fields.status")}</Label>
              <select
                id="resource-status"
                disabled={!canEdit}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                {...form.register("status")}
              >
                {SCHEDULING_RESOURCE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`scheduling.resources.statuses.${status}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resource-timezone">{t("scheduling.resources.fields.timezone")}</Label>
              <select
                id="resource-timezone"
                disabled={!canEdit}
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                {...form.register("timezone")}
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-description">
              {t("scheduling.resources.fields.description")}
            </Label>
            <textarea
              id="resource-description"
              disabled={!canEdit}
              rows={3}
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm resize-none"
              {...form.register("description")}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-background/20 p-3 space-y-3">
            <CapabilityMultiSelect
              label={t("scheduling.capabilities.resourceServicesTitle")}
              items={serviceItems}
              selectedIds={serviceIds}
              onChange={setServiceIds}
              disabled={!canEdit || isPending}
              isLoading={servicesLoading || (isEdit && mappedLoading)}
              emptyMessage={t("scheduling.capabilities.noServicesAvailable")}
            />
            {serviceIds.length === 0 && (
              <p className="text-xs text-amber-400/90 flex items-start gap-2 leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t("scheduling.capabilities.resourceNoServicesWarning")}
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
