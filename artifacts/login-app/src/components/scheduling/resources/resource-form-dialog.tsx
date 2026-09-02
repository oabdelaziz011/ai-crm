import { useEffect, useMemo, useRef, useState } from "react";
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
  type SchedulingService,
} from "@/lib/scheduling/types";

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

const EMPTY_SERVICES: SchedulingService[] = [];

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
  const { t, i18n } = useTranslation("common");
  const isEdit = Boolean(resource);
  const resourceId = resource?.id ?? null;
  const isRtl = i18n.language?.toLowerCase().startsWith("ar") || i18n.dir() === "rtl";
  const direction = isRtl ? "rtl" : "ltr";
  const alignClass = isRtl ? "text-right" : "text-left";
  const fieldAlignStyle = { textAlign: isRtl ? ("right" as const) : ("left" as const) };

  const { data: allServices = EMPTY_SERVICES, isLoading: servicesLoading } =
    useSchedulingServices(companyId);
  const { data: mappedServicesData, isLoading: mappedLoading } = useResourceCapabilities(
    companyId,
    resourceId,
  );
  const mappedServices = mappedServicesData ?? EMPTY_SERVICES;

  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const hydratedMappedForResourceRef = useRef<string | null>(null);

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

  // Reset only when the dialog opens or the edited resource changes — never on
  // every render (unstable `data ?? []` defaults were wiping in-progress input).
  useEffect(() => {
    if (!open) {
      hydratedMappedForResourceRef.current = null;
      return;
    }

    form.reset({
      name: resource?.name ?? "",
      resource_type: resource?.resource_type ?? "employee",
      branch_id: resource?.branch_id ?? null,
      status: resource?.status ?? "active",
      timezone: resource?.timezone ?? defaultTimezone,
      description: resource?.description ?? "",
    });
    setServiceIds([]);
    hydratedMappedForResourceRef.current = null;
  }, [open, resourceId, defaultTimezone, form, resource]);

  useEffect(() => {
    if (!open || !isEdit || !resourceId || mappedLoading) return;
    if (hydratedMappedForResourceRef.current === resourceId) return;
    hydratedMappedForResourceRef.current = resourceId;
    setServiceIds(mappedServices.map((service) => service.id));
  }, [open, isEdit, resourceId, mappedLoading, mappedServices]);

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
      <DialogContent
        className="sm:max-w-lg border-border/60 bg-card max-h-[90vh] overflow-y-auto"
        dir={direction}
        style={{ direction }}
      >
        <DialogHeader className={alignClass}>
          <DialogTitle style={fieldAlignStyle}>
            {isEdit
              ? t("scheduling.resources.editTitle")
              : t("scheduling.resources.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className={`space-y-4 ${alignClass}`}
          dir={direction}
          style={{ direction }}
        >
          <div className="space-y-2">
            <Label htmlFor="resource-name" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
              {t("scheduling.resources.fields.name")}
            </Label>
            <Input
              id="resource-name"
              disabled={!canEdit}
              {...form.register("name")}
              className={`bg-background border-border/60 ${alignClass}`}
              style={fieldAlignStyle}
            />
            {form.formState.errors.name && (
              <p className={`text-xs text-destructive ${alignClass}`} style={fieldAlignStyle}>
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource-type" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
              {t("scheduling.resources.fields.type")}
            </Label>
            <select
              id="resource-type"
              disabled={!canEdit}
              className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm ${alignClass}`}
              style={fieldAlignStyle}
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
            <Label htmlFor="resource-branch" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
              {t("scheduling.resources.fields.branch")}
            </Label>
            <select
              id="resource-branch"
              disabled={!canEdit}
              className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm ${alignClass}`}
              style={fieldAlignStyle}
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
              <Label htmlFor="resource-status" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
                {t("scheduling.resources.fields.status")}
              </Label>
              <select
                id="resource-status"
                disabled={!canEdit}
                className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm ${alignClass}`}
                style={fieldAlignStyle}
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
              <Label htmlFor="resource-timezone" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
                {t("scheduling.resources.fields.timezone")}
              </Label>
              <select
                id="resource-timezone"
                disabled={!canEdit}
                className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm ${alignClass}`}
                style={fieldAlignStyle}
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
            <Label htmlFor="resource-description" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
              {t("scheduling.resources.fields.description")}
            </Label>
            <textarea
              id="resource-description"
              disabled={!canEdit}
              rows={3}
              className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm resize-none ${alignClass}`}
              style={fieldAlignStyle}
              {...form.register("description")}
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-background p-3 space-y-3">
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
            <Button type="button" variant="outline" onClick={onClose} className="border-border/60">
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
