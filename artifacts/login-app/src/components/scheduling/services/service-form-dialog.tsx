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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CapabilityMultiSelect,
  type CapabilitySelectItem,
} from "@/components/scheduling/capabilities/capability-multi-select";
import {
  createInitialPricingRule,
  ServicePricingRulesEditor,
} from "@/components/scheduling/services/service-pricing-rules-editor";
import { useServiceResources } from "@/hooks/scheduling/use-resource-capabilities";
import { useSchedulingResources } from "@/hooks/scheduling/use-scheduling-resources";
import {
  usePricingRuleTypes,
  useServicePricingRules,
} from "@/hooks/scheduling/use-service-pricing";
import { useCompanyLocaleContext } from "@/context/company-locale-context";
import {
  COMPANY_DEFAULT_CURRENCY,
  SCHEDULING_SERVICE_STATUSES,
  type SchedulingResource,
  type SchedulingService,
} from "@/lib/scheduling/types";
import {
  pricingRulesFormSchema,
  serviceGeneralFormSchema,
  type PricingRuleFormValues,
  type ServiceGeneralFormValues,
} from "@/lib/scheduling/validation/service-schemas";

const EMPTY_RESOURCES: SchedulingResource[] = [];

export type ServiceFormSubmitPayload = {
  values: ServiceGeneralFormValues;
  resourceIds: string[];
  pricingRules: PricingRuleFormValues[];
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

function resolveCurrencyForSave(currency: string, companyCurrency: string): string {
  if (currency === COMPANY_DEFAULT_CURRENCY) return companyCurrency.toUpperCase();
  return currency.toUpperCase();
}

export function ServiceFormDialog({
  open,
  onClose,
  companyId,
  service,
  canEdit,
  isPending,
  onSubmit,
}: Props) {
  const { t, i18n } = useTranslation("common");
  const isEdit = Boolean(service);
  const serviceId = service?.id ?? null;
  const isRtl = i18n.language?.toLowerCase().startsWith("ar") || i18n.dir() === "rtl";
  const direction = isRtl ? "rtl" : "ltr";
  const alignClass = isRtl ? "text-right" : "text-left";
  const fieldAlignStyle = { textAlign: isRtl ? ("right" as const) : ("left" as const) };
  const [tab, setTab] = useState<"general" | "pricing" | "resources">("general");
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRuleFormValues[]>([]);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const hydratedMappedForServiceRef = useRef<string | null>(null);

  const { data: allResourcesData, isLoading: resourcesLoading } = useSchedulingResources(companyId);
  const allResources = allResourcesData ?? EMPTY_RESOURCES;
  const { data: mappedResourcesData, isLoading: mappedLoading } = useServiceResources(
    companyId,
    serviceId,
  );
  const mappedResources = mappedResourcesData ?? EMPTY_RESOURCES;
  const {
    data: types = [],
    isLoading: typesLoading,
    isError: typesError,
  } = usePricingRuleTypes(companyId);
  const { data: existingRules = [], isLoading: rulesLoading } = useServicePricingRules(
    companyId,
    serviceId,
  );
  const { currency: companyCurrency } = useCompanyLocaleContext();

  const form = useForm<ServiceGeneralFormValues>({
    resolver: zodResolver(serviceGeneralFormSchema),
    defaultValues: {
      name: "",
      category: "",
      description: "",
      status: "active",
    },
  });

  useEffect(() => {
    if (!open) {
      hydratedMappedForServiceRef.current = null;
      return;
    }
    // Edit opens on Pricing (not Resources / General).
    setTab(isEdit ? "pricing" : "general");
    setPricingError(null);
    form.reset({
      name: service?.name ?? "",
      category: service?.category ?? "",
      description: service?.description ?? "",
      status: service?.status ?? "active",
    });
    setResourceIds([]);
    hydratedMappedForServiceRef.current = null;
  }, [open, serviceId, form, isEdit, service]);

  useEffect(() => {
    if (!open || !isEdit || !serviceId || mappedLoading) return;
    if (hydratedMappedForServiceRef.current === serviceId) return;
    hydratedMappedForServiceRef.current = serviceId;
    setResourceIds(mappedResources.map((resource) => resource.id));
  }, [open, isEdit, serviceId, mappedLoading, mappedResources]);

  useEffect(() => {
    if (!open || typesLoading) return;
    if (isEdit) {
      if (rulesLoading) return;
      if (existingRules.length) {
        setPricingRules(
          existingRules.map((rule) => ({
            id: rule.id,
            typeId: rule.type_id,
            price: rule.price_cents / 100,
            currency:
              rule.currency.toUpperCase() === companyCurrency
                ? COMPANY_DEFAULT_CURRENCY
                : rule.currency.toUpperCase(),
            durationMinutes: rule.duration_minutes,
            isDefault: rule.is_default,
            description: rule.description,
          })),
        );
        return;
      }
      // Migrating legacy service with no rules yet — seed from service columns.
      const seed = createInitialPricingRule(types);
      setPricingRules([
        {
          ...seed,
          price: Math.max((service?.price_cents ?? 0) / 100, 0.01),
          currency: COMPANY_DEFAULT_CURRENCY,
          durationMinutes: service?.duration_minutes ?? 30,
          isDefault: true,
        },
      ]);
      return;
    }
    setPricingRules([createInitialPricingRule(types)]);
  }, [
    open,
    isEdit,
    types,
    typesLoading,
    existingRules,
    rulesLoading,
    service?.price_cents,
    service?.duration_minutes,
    companyCurrency,
  ]);

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

  const handleSubmit = form.handleSubmit((values) => {
    const resolvedRules = pricingRules.map((rule) => ({
      ...rule,
      currency: resolveCurrencyForSave(rule.currency, companyCurrency),
    }));
    const parsed = pricingRulesFormSchema.safeParse({ rules: resolvedRules });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "scheduling.services.pricing.validation.oneDefault";
      setPricingError(t(message, { defaultValue: message }));
      setTab("pricing");
      return;
    }
    setPricingError(null);
    onSubmit({
      values,
      resourceIds,
      pricingRules: parsed.data.rules,
    });
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="sm:max-w-3xl border-border/60 bg-card max-h-[90vh] overflow-y-auto"
        dir={direction}
        style={{ direction }}
      >
        <DialogHeader className={alignClass}>
          <DialogTitle style={fieldAlignStyle}>
            {isEdit
              ? t("scheduling.services.editTitle")
              : t("scheduling.services.createTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className={`space-y-4 ${alignClass}`} style={{ direction }} dir={direction}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} dir={direction}>
            <TabsList className="grid h-9 w-full grid-cols-3" dir={direction} style={{ direction }}>
              <TabsTrigger value="general">
                {t("scheduling.services.tabs.general", { defaultValue: "General" })}
              </TabsTrigger>
              <TabsTrigger value="pricing">
                {t("scheduling.services.tabs.pricing", { defaultValue: "Pricing" })}
              </TabsTrigger>
              <TabsTrigger value="resources">
                {t("scheduling.services.tabs.resources", { defaultValue: "Resources" })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-4 space-y-4" dir={direction}>
              <div className="space-y-2">
                <Label htmlFor="service-name" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
                  {t("scheduling.services.fields.name")}
                </Label>
                <Input
                  id="service-name"
                  disabled={!canEdit}
                  {...form.register("name")}
                  className={`bg-background border-border/60 ${alignClass}`}
                  style={fieldAlignStyle}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="service-category" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
                    {t("scheduling.services.fields.category", { defaultValue: "Category" })}
                  </Label>
                  <Input
                    id="service-category"
                    disabled={!canEdit}
                    {...form.register("category")}
                    className={`bg-background border-border/60 ${alignClass}`}
                    style={fieldAlignStyle}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-status" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
                    {t("scheduling.services.fields.status")}
                  </Label>
                  <select
                    id="service-status"
                    disabled={!canEdit}
                    className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm ${alignClass}`}
                    style={fieldAlignStyle}
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
                <Label htmlFor="service-description" className={`ui-field-label ${alignClass}`} style={fieldAlignStyle}>
                  {t("scheduling.services.fields.description")}
                </Label>
                <textarea
                  id="service-description"
                  disabled={!canEdit}
                  rows={3}
                  className={`w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm resize-none ${alignClass}`}
                  style={fieldAlignStyle}
                  {...form.register("description")}
                />
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="mt-4" dir={direction}>
              <ServicePricingRulesEditor
                rules={pricingRules}
                types={types}
                typesLoading={typesLoading}
                typesError={typesError}
                companyCurrency={companyCurrency}
                canEdit={canEdit && !typesLoading && types.length > 0}
                errorMessage={pricingError}
                onChange={(next) => {
                  setPricingError(null);
                  setPricingRules(next);
                }}
              />
            </TabsContent>

            <TabsContent value="resources" className="mt-4" dir={direction}>
              <div className="rounded-xl border border-border/60 bg-background p-3 space-y-3">
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
                  <p
                    className={`text-xs text-amber-400/90 flex items-start gap-2 leading-relaxed ${alignClass}`}
                    style={fieldAlignStyle}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {t("scheduling.capabilities.serviceNoResourcesWarning")}
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className={`gap-2 ${isRtl ? "sm:justify-start" : "sm:justify-end"}`}>
            <Button type="button" variant="outline" onClick={onClose} className="border-border/60">
              {t("buttons.cancel")}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={isPending || typesLoading} className="gap-2">
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
