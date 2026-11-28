import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useCompanyDeliveryZones } from "@/hooks/sales/use-company-delivery-zones";
import {
  useCompanyDeliveryWorkers,
  useDeleteCompanyDeliveryWorker,
  useSaveCompanyDeliveryWorker,
  useToggleCompanyDeliveryWorkerActive,
} from "@/hooks/sales/use-company-delivery-workers";
import {
  useCompanyOrderSettings,
  useSaveCompanyOrderSettings,
} from "@/hooks/sales/use-company-order-settings";
import {
  DEFAULT_DELIVERY_WORKER_FORM,
  type CompanyDeliveryWorkerFormValues,
} from "@/lib/sales-order-settings/company-delivery-workers";
import type { DeliveryAssignmentMode } from "@/lib/sales-order-settings/company-order-settings";
import { CustomerPhoneInput } from "@/components/customers/customer-phone-input";
import { validateCustomerPhoneFormInput } from "@/lib/customers/customer-phone-form";
import {
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

export function SalesDeliveryWorkersTab({
  companyId,
  canEdit,
  onOpenDeliverySettings,
}: {
  companyId: string | null;
  canEdit: boolean;
  onOpenDeliverySettings?: () => void;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { data: zones = [] } = useCompanyDeliveryZones(companyId);
  const { data: workers = [], isLoading, error } = useCompanyDeliveryWorkers(companyId);
  const orderSettings = useCompanyOrderSettings(companyId);
  const saveOrderSettings = useSaveCompanyOrderSettings(companyId);
  const saveWorker = useSaveCompanyDeliveryWorker(companyId);
  const deleteWorker = useDeleteCompanyDeliveryWorker(companyId);
  const toggleActive = useToggleCompanyDeliveryWorkerActive(companyId);
  const [draft, setDraft] = useState<CompanyDeliveryWorkerFormValues>({
    ...DEFAULT_DELIVERY_WORKER_FORM,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState<string | null>("EG");
  const [assignmentMode, setAssignmentMode] = useState<DeliveryAssignmentMode>("manual");

  useEffect(() => {
    if (orderSettings.data?.form.deliveryAssignmentMode) {
      setAssignmentMode(orderSettings.data.form.deliveryAssignmentMode);
    }
  }, [orderSettings.data?.form.deliveryAssignmentMode]);

  const zoneById = useMemo(
    () => new Map(zones.filter((zone) => zone.id).map((zone) => [zone.id!, zone])),
    [zones],
  );

  const resetDraft = () => {
    setDraft({ ...DEFAULT_DELIVERY_WORKER_FORM });
    setEditingId(null);
    setPhone("");
    setRegion("EG");
  };

  const startEdit = (worker: CompanyDeliveryWorkerFormValues) => {
    setDraft({ ...worker, zoneLabels: [...worker.zoneLabels] });
    setEditingId(worker.id ?? null);
    setPhone(worker.phoneE164);
    setRegion(null);
  };

  const toggleZone = (zoneId: string, checked: boolean) => {
    setDraft((current) => {
      const nextIds = new Set(current.zoneIds);
      if (checked) nextIds.add(zoneId);
      else nextIds.delete(zoneId);
      const zoneLabels = [...nextIds].map((id) => {
        const zone = zoneById.get(id);
        return {
          id,
          label: zone ? `${zone.governorate} · ${zone.zoneName}` : id,
        };
      });
      return { ...current, zoneIds: [...nextIds], zoneLabels };
    });
  };

  const onSaveAssignmentMode = (mode: DeliveryAssignmentMode) => {
    if (!canEdit || !orderSettings.data) return;
    setAssignmentMode(mode);
    saveOrderSettings.mutate(
      { ...orderSettings.data.form, deliveryAssignmentMode: mode },
      {
        onSuccess: () =>
          toast({
            title:
              mode === "ai"
                ? t("dashboard.settings.salesOrder.workers.assignmentModeAiSaved")
                : t("dashboard.settings.salesOrder.workers.assignmentModeManualSaved"),
          }),
        onError: (e) =>
          toast({
            variant: "destructive",
            title: t("dashboard.settings.salesOrder.workers.saveFailed"),
            description: e.message,
          }),
      },
    );
  };

  const onSave = () => {
    if (!canEdit) return;
    const phoneValidation = validateCustomerPhoneFormInput({ phone, region });
    if (phoneValidation.code !== "ok" || !phoneValidation.preview.phoneE164) {
      toast({
        variant: "destructive",
        title: t("dashboard.settings.salesOrder.workers.saveFailed"),
        description:
          phoneValidation.code === "phone_region_required"
            ? t("dashboard.settings.salesOrder.workers.errors.phoneRegionRequired")
            : phoneValidation.code === "empty"
              ? t("dashboard.settings.salesOrder.workers.errors.phoneRequired")
              : t("dashboard.settings.salesOrder.workers.errors.phoneInvalid"),
      });
      return;
    }

    saveWorker.mutate(
      {
        ...draft,
        id: editingId ?? undefined,
        phoneE164: phoneValidation.preview.phoneE164,
      },
      {
        onSuccess: () => {
          toast({ title: t("dashboard.settings.salesOrder.workers.saved") });
          resetDraft();
        },
        onError: (e) => {
          const code = e.message;
          const description =
            code === "full_name_required"
              ? t("dashboard.settings.salesOrder.workers.errors.nameRequired")
              : code === "phone_required"
                ? t("dashboard.settings.salesOrder.workers.errors.phoneRequired")
                : code === "phone_invalid"
                  ? t("dashboard.settings.salesOrder.workers.errors.phoneInvalid")
                  : code === "worker_phone_duplicate"
                    ? t("dashboard.settings.salesOrder.workers.errors.duplicate")
                    : e.message;
          toast({
            variant: "destructive",
            title: t("dashboard.settings.salesOrder.workers.saveFailed"),
            description,
          });
        },
      },
    );
  };

  if (isLoading) return <DashboardTableSkeleton />;

  return (
    <div className="space-y-5" data-testid="sales-delivery-workers-tab">
      <p className="text-xs text-muted-foreground">
        {t("dashboard.settings.salesOrder.workers.subtitle")}
      </p>
      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <div className="space-y-3 rounded-md border border-border/60 p-4">
        <Label className="text-sm font-medium">
          {t("dashboard.settings.salesOrder.workers.assignmentModeTitle")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t("dashboard.settings.salesOrder.workers.assignmentModeHelp")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canEdit || saveOrderSettings.isPending}
            onClick={() => onSaveAssignmentMode("manual")}
            className={`rounded-md border px-3 py-2 text-start text-sm ${
              assignmentMode === "manual"
                ? "border-primary bg-primary/5"
                : "border-border/50 hover:bg-muted/40"
            }`}
          >
            <span className="font-medium">
              {t("dashboard.settings.salesOrder.workers.assignmentModeManual")}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.workers.assignmentModeManualHelp")}
            </span>
          </button>
          <button
            type="button"
            disabled={!canEdit || saveOrderSettings.isPending}
            onClick={() => onSaveAssignmentMode("ai")}
            className={`rounded-md border px-3 py-2 text-start text-sm ${
              assignmentMode === "ai"
                ? "border-primary bg-primary/5"
                : "border-border/50 hover:bg-muted/40"
            }`}
          >
            <span className="font-medium">
              {t("dashboard.settings.salesOrder.workers.assignmentModeAi")}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.workers.assignmentModeAiHelp")}
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">
            {editingId
              ? t("dashboard.settings.salesOrder.workers.editWorker")
              : t("dashboard.settings.salesOrder.workers.addWorker")}
          </Label>
          {editingId ? (
            <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
              {t("dashboard.settings.salesOrder.workers.cancelEdit")}
            </Button>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="delivery-worker-name">
            {t("dashboard.settings.salesOrder.workers.fullName")}
          </Label>
          <Input
            id="delivery-worker-name"
            value={draft.fullName}
            disabled={!canEdit}
            onChange={(event) => setDraft((c) => ({ ...c, fullName: event.target.value }))}
          />
        </div>

        <div className="space-y-1">
          <Label>{t("dashboard.settings.salesOrder.workers.phone")}</Label>
          <CustomerPhoneInput
            phone={phone}
            region={region}
            onPhoneChange={setPhone}
            onRegionChange={setRegion}
            disabled={!canEdit}
            showValidation
          />
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesOrder.workers.phoneHelp")}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
          <div>
            <p className="text-sm font-medium">{t("dashboard.settings.salesOrder.workers.active")}</p>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.workers.activeHelp")}
            </p>
          </div>
          <Switch
            checked={draft.isActive}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((c) => ({ ...c, isActive: checked === true }))}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{t("dashboard.settings.salesOrder.workers.zones")}</Label>
            {onOpenDeliverySettings ? (
              <Button type="button" size="sm" variant="outline" onClick={onOpenDeliverySettings}>
                {t("dashboard.settings.salesOrder.workers.openDeliverySettings")}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesOrder.workers.zonesHelp")}
          </p>
          {zones.length === 0 ? (
            <div className="space-y-2 rounded-md border border-dashed border-border/60 p-3">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.settings.salesOrder.workers.noZones")}
              </p>
              {onOpenDeliverySettings ? (
                <Button type="button" size="sm" onClick={onOpenDeliverySettings}>
                  {t("dashboard.settings.salesOrder.workers.openDeliverySettings")}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {zones.map((zone) => (
                <label
                  key={zone.id}
                  className="flex items-start gap-2 rounded-md border border-border/40 px-3 py-2 text-sm"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={Boolean(zone.id && draft.zoneIds.includes(zone.id))}
                    disabled={!canEdit || !zone.id}
                    onCheckedChange={(checked) => {
                      if (!zone.id) return;
                      toggleZone(zone.id, checked === true);
                    }}
                  />
                  <span>
                    <span className="font-medium">
                      {zone.governorate} · {zone.zoneName}
                    </span>
                    {!zone.enabled ? (
                      <span className="ms-1 text-xs text-muted-foreground">
                        ({t("dashboard.settings.salesOrder.delivery.statusDisabled")})
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {zones.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.workers.addZonesHint")}
            </p>
          ) : null}
          {draft.zoneLabels.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.workers.selectedZones", {
                zones: draft.zoneLabels.map((zone) => zone.label).join("، "),
              })}
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          size="sm"
          disabled={!canEdit || saveWorker.isPending}
          onClick={onSave}
        >
          {saveWorker.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Plus className="size-4" />
              {editingId
                ? t("dashboard.settings.salesOrder.workers.updateWorker")
                : t("dashboard.settings.salesOrder.workers.saveWorker")}
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <Label>{t("dashboard.settings.salesOrder.workers.listTitle")}</Label>
        {workers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.settings.salesOrder.workers.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {workers.map((worker) => (
              <li
                key={worker.id}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-3 text-sm"
              >
                <div className="min-w-0 flex-1 space-y-1 text-start">
                  <p className="font-medium">{worker.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    <span dir="ltr" className="inline-block">
                      {worker.phoneE164}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {worker.zoneLabels.length > 0
                      ? worker.zoneLabels.map((zone) => zone.label).join(" · ")
                      : t("dashboard.settings.salesOrder.workers.noZonesAssigned")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-border/40 px-2 py-1">
                    <span className="text-xs text-muted-foreground">
                      {worker.isActive
                        ? t("dashboard.settings.salesOrder.workers.statusActive")
                        : t("dashboard.settings.salesOrder.workers.statusInactive")}
                    </span>
                    <Switch
                      checked={worker.isActive}
                      disabled={!canEdit || toggleActive.isPending || !worker.id}
                      onCheckedChange={(checked) => {
                        if (!worker.id) return;
                        toggleActive.mutate(
                          { workerId: worker.id, isActive: checked === true },
                          {
                            onSuccess: () =>
                              toast({
                                title: checked
                                  ? t("dashboard.settings.salesOrder.workers.activated")
                                  : t("dashboard.settings.salesOrder.workers.deactivated"),
                              }),
                            onError: (e) =>
                              toast({
                                variant: "destructive",
                                title: t("dashboard.settings.salesOrder.workers.saveFailed"),
                                description: e.message,
                              }),
                          },
                        );
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit}
                    onClick={() => startEdit(worker)}
                  >
                    {t("dashboard.settings.salesOrder.workers.edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!canEdit || deleteWorker.isPending || !worker.id}
                    onClick={() => {
                      if (!worker.id) return;
                      deleteWorker.mutate(worker.id, {
                        onSuccess: () =>
                          toast({ title: t("dashboard.settings.salesOrder.workers.deleted") }),
                        onError: (e) =>
                          toast({
                            variant: "destructive",
                            title: t("dashboard.settings.salesOrder.workers.deleteFailed"),
                            description: e.message,
                          }),
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
