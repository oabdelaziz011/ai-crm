import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import {
  useCompanyDeliveryZones,
  useDeleteCompanyDeliveryZone,
  useSaveCompanyDeliveryZone,
} from "@/hooks/sales/use-company-delivery-zones";
import {
  DEFAULT_DELIVERY_ZONE_FORM,
  type CompanyDeliveryZoneFormValues,
} from "@/lib/sales-order-settings/company-delivery-zones";
import {
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function SalesDeliverySettingsTab({
  companyId,
  canEdit,
}: {
  companyId: string | null;
  canEdit: boolean;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { data: zones = [], isLoading, error } = useCompanyDeliveryZones(companyId);
  const saveZone = useSaveCompanyDeliveryZone(companyId);
  const deleteZone = useDeleteCompanyDeliveryZone(companyId);
  const [draft, setDraft] = useState<CompanyDeliveryZoneFormValues>({ ...DEFAULT_DELIVERY_ZONE_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft({ ...DEFAULT_DELIVERY_ZONE_FORM });
    setEditingId(null);
  };

  const startEdit = (zone: CompanyDeliveryZoneFormValues) => {
    setDraft({ ...zone });
    setEditingId(zone.id ?? null);
  };

  const onSave = () => {
    if (!canEdit) return;
    saveZone.mutate(
      { ...draft, id: editingId ?? undefined },
      {
        onSuccess: () => {
          toast({ title: t("dashboard.settings.salesOrder.delivery.saved") });
          resetDraft();
        },
        onError: (e) => {
          const code = e.message;
          const description =
            code === "governorate_required"
              ? t("dashboard.settings.salesOrder.delivery.errors.governorateRequired")
              : code === "zone_name_required"
                ? t("dashboard.settings.salesOrder.delivery.errors.zoneNameRequired")
                : code === "eta_min_exceeds_max"
                  ? t("dashboard.settings.salesOrder.delivery.errors.etaMinExceedsMax")
                  : code === "delivery_fee_invalid"
                    ? t("dashboard.settings.salesOrder.delivery.errors.feeInvalid")
                    : code === "zone_duplicate"
                      ? t("dashboard.settings.salesOrder.delivery.errors.duplicate")
                      : e.message;
          toast({
            variant: "destructive",
            title: t("dashboard.settings.salesOrder.delivery.saveFailed"),
            description,
          });
        },
      },
    );
  };

  if (isLoading) return <DashboardTableSkeleton />;

  return (
    <div className="space-y-5" data-testid="sales-delivery-settings-tab">
      <div>
        <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesOrder.delivery.subtitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.settings.salesOrder.delivery.noHardcodeHint")}
        </p>
      </div>

      {error ? <DashboardErrorBanner message={error.message} /> : null}

      <div className="space-y-3 rounded-md border border-border/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-medium">
            {editingId
              ? t("dashboard.settings.salesOrder.delivery.editZone")
              : t("dashboard.settings.salesOrder.delivery.addZone")}
          </Label>
          {editingId ? (
            <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={resetDraft}>
              {t("dashboard.settings.salesOrder.delivery.cancelEdit")}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.governorate")}</Label>
            <Input
              disabled={!canEdit}
              value={draft.governorate}
              onChange={(e) => setDraft((prev) => ({ ...prev, governorate: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.zoneName")}</Label>
            <Input
              disabled={!canEdit}
              value={draft.zoneName}
              onChange={(e) => setDraft((prev) => ({ ...prev, zoneName: e.target.value }))}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.aliases")}</Label>
            <Input
              disabled={!canEdit}
              value={draft.aliasesText}
              placeholder={t("dashboard.settings.salesOrder.delivery.aliasesPlaceholder")}
              onChange={(e) => setDraft((prev) => ({ ...prev, aliasesText: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              {t("dashboard.settings.salesOrder.delivery.aliasesHelp")}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.fee")}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={!canEdit}
              value={draft.deliveryFee}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, deliveryFee: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.etaUnit")}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={!canEdit}
              value={draft.etaUnit}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  etaUnit: e.target.value === "hours" ? "hours" : "days",
                }))
              }
            >
              <option value="hours">{t("dashboard.settings.salesOrder.delivery.unitHours")}</option>
              <option value="days">{t("dashboard.settings.salesOrder.delivery.unitDays")}</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.etaMin")}</Label>
            <Input
              type="number"
              min={1}
              disabled={!canEdit}
              value={draft.etaMin}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, etaMin: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("dashboard.settings.salesOrder.delivery.etaMax")}</Label>
            <Input
              type="number"
              min={1}
              disabled={!canEdit}
              value={draft.etaMax}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, etaMax: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={draft.enabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked === true }))}
          />
          {t("dashboard.settings.salesOrder.delivery.enabled")}
        </label>

        <Button type="button" disabled={!canEdit || saveZone.isPending} onClick={onSave}>
          {saveZone.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {editingId
            ? t("dashboard.settings.salesOrder.delivery.updateZone")
            : t("dashboard.settings.salesOrder.delivery.saveZone")}
        </Button>
      </div>

      <div className="space-y-2">
        <Label>{t("dashboard.settings.salesOrder.delivery.zonesList")}</Label>
        {zones.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesOrder.delivery.empty")}</p>
        ) : (
          <div className="space-y-2">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 p-3 text-sm"
              >
                <div className="min-w-0 space-y-1 text-start">
                  <p className="font-medium">
                    {zone.governorate} · {zone.zoneName}
                  </p>
                  {zone.aliasesText ? (
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.settings.salesOrder.delivery.aliasesList", {
                        aliases: zone.aliasesText,
                      })}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.settings.salesOrder.delivery.zoneSummary", {
                      fee: zone.deliveryFee,
                      min: zone.etaMin,
                      max: zone.etaMax,
                      unit: t(
                        zone.etaUnit === "hours"
                          ? "dashboard.settings.salesOrder.delivery.unitHours"
                          : "dashboard.settings.salesOrder.delivery.unitDays",
                      ),
                      status: zone.enabled
                        ? t("dashboard.settings.salesOrder.delivery.statusEnabled")
                        : t("dashboard.settings.salesOrder.delivery.statusDisabled"),
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit}
                    onClick={() => startEdit(zone)}
                  >
                    {t("dashboard.settings.salesOrder.delivery.edit")}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={!canEdit || deleteZone.isPending || !zone.id}
                    aria-label={t("dashboard.settings.salesOrder.delivery.delete")}
                    onClick={() => {
                      if (!zone.id) return;
                      deleteZone.mutate(zone.id, {
                        onSuccess: () =>
                          toast({ title: t("dashboard.settings.salesOrder.delivery.deleted") }),
                        onError: (e) =>
                          toast({
                            variant: "destructive",
                            title: t("dashboard.settings.salesOrder.delivery.deleteFailed"),
                            description: e.message,
                          }),
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!canEdit ? (
        <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesOrder.readOnly")}</p>
      ) : null}
    </div>
  );
}
