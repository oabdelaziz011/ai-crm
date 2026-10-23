import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, MessageSquareReply, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import {
  useSaveSalesFollowUpSettings,
  useSalesFollowUpSettings,
} from "@/hooks/sales/use-sales-follow-up-settings";
import {
  applyScheduleStepsToForm,
  DEFAULT_SALES_FOLLOW_UP_FORM,
  defaultScheduleStepsTemplate,
  SALES_FOLLOW_UP_CHANNEL_OPTIONS,
  validateSalesFollowUpForm,
  type SalesFollowUpSettingsFormValues,
} from "@/lib/sales-follow-up/sales-follow-up-settings";
import { timezoneSelectOptions } from "@/lib/iana-timezones";
import type { SalesFollowUpDurationUnit, SalesFollowUpScheduleStep } from "@workspace/automation-platform";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function useWorkerStatus() {
  const [status, setStatus] = useState<{
    workerEnabled: boolean;
    allowSend: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apiBase = (import.meta.env.VITE_API_SERVER_URL as string | undefined)?.replace(/\/$/, "") || "";
    if (!apiBase) return;
    void fetch(`${apiBase}/api/sales-follow-up/status`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { workerEnabled?: boolean; allowSend?: boolean };
      })
      .then((body) => {
        if (cancelled || !body) return;
        setStatus({
          workerEnabled: body.workerEnabled === true,
          allowSend: body.allowSend === true,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

export function SettingsSalesFollowUpPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = profile?.company_id ?? null;
  const canEdit =
    isSuperAdmin || hasPermission("settings.edit") || hasPermission("leads.manage");
  const workerStatus = useWorkerStatus();

  const { data, isLoading, error } = useSalesFollowUpSettings(companyId);
  const saveSettings = useSaveSalesFollowUpSettings(companyId);

  const form = useForm<SalesFollowUpSettingsFormValues>({
    defaultValues: { ...DEFAULT_SALES_FOLLOW_UP_FORM },
  });

  useEffect(() => {
    if (data) form.reset(data.form);
  }, [data, form]);
  const configState = data?.configState ?? null;

  const channels = form.watch("channels") ?? [];
  const approvalMode = form.watch("approvalMode");
  const enabled = form.watch("enabled");
  const scheduleSteps = form.watch("scheduleSteps") ?? [];
  const businessHours = form.watch("businessHours");
  const timezone = form.watch("timezone");
  const timezoneOptions = useMemo(() => timezoneSelectOptions(timezone), [timezone]);
  const maxAttempts = useMemo(
    () => scheduleSteps.filter((step) => step.enabled && step.amount > 0).length,
    [scheduleSteps],
  );

  const setSteps = (next: SalesFollowUpScheduleStep[]) => {
    const current = form.getValues();
    const applied = applyScheduleStepsToForm(current, next);
    form.reset(applied);
  };

  const updateStep = (index: number, patch: Partial<SalesFollowUpScheduleStep>) => {
    const next = scheduleSteps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    setSteps(next);
  };

  const addStep = () => {
    if (scheduleSteps.length >= 5) return;
    const last = scheduleSteps[scheduleSteps.length - 1];
    setSteps([
      ...scheduleSteps,
      {
        attemptNumber: scheduleSteps.length + 1,
        amount: last?.amount ?? 1,
        unit: last?.unit ?? "days",
        enabled: true,
      },
    ]);
  };

  const removeStep = (index: number) => {
    if (scheduleSteps.length <= 1) return;
    setSteps(
      scheduleSteps
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, attemptNumber: i + 1 })),
    );
  };

  const channelsMissing = enabled && channels.length === 0;

  const onSubmit = form.handleSubmit((values) => {
    if (!canEdit) return;
    const applied = applyScheduleStepsToForm(values, values.scheduleSteps ?? []);
    const validationError = validateSalesFollowUpForm(applied);
    if (validationError === "channels_required_when_enabled") {
      toast({
        variant: "destructive",
        title: t("dashboard.settings.salesFollowUp.channelsRequiredTitle"),
        description: t("dashboard.settings.salesFollowUp.channelsRequired"),
      });
      document.getElementById("sales-follow-up-channels")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (validationError === "schedule_steps_required") {
      toast({
        variant: "destructive",
        title: t("dashboard.settings.salesFollowUp.saveFailed"),
        description: t("dashboard.settings.salesFollowUp.scheduleStepsRequired"),
      });
      return;
    }
    saveSettings.mutate(applied, {
      onSuccess: () => toast({ title: t("dashboard.settings.salesFollowUp.saved") }),
      onError: (e) => {
        const code = e.message;
        const description =
          code === "channels_required_when_enabled"
            ? t("dashboard.settings.salesFollowUp.channelsRequired")
            : code === "schedule_steps_required"
              ? t("dashboard.settings.salesFollowUp.scheduleStepsRequired")
              : e.message;
        toast({
          variant: "destructive",
          title:
            code === "channels_required_when_enabled"
              ? t("dashboard.settings.salesFollowUp.channelsRequiredTitle")
              : t("dashboard.settings.salesFollowUp.saveFailed"),
          description,
        });
      },
    });
  });

  if (isLoading) return <DashboardTableSkeleton />;

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareReply className="size-4 text-primary" />
          {t("dashboard.settings.salesFollowUp.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.settings.salesFollowUp.subtitle")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground/90">
          {t("dashboard.settings.salesFollowUp.defaultOffHint")}
        </p>
        {workerStatus ? (
          <p
            className={`mt-3 text-xs ${
              workerStatus.workerEnabled ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
            }`}
          >
            {workerStatus.workerEnabled
              ? t("dashboard.settings.salesFollowUp.workerRunning", {
                  send: workerStatus.allowSend
                    ? t("dashboard.settings.salesFollowUp.workerSendOn")
                    : t("dashboard.settings.salesFollowUp.workerSendOff"),
                })
              : t("dashboard.settings.salesFollowUp.workerStopped")}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="p-5">
          <DashboardErrorBanner message={error.message} />
        </div>
      ) : null}

      {configState === "unconfigured" ? (
        <div
          role="status"
          data-testid="sales-follow-up-unconfigured"
          className="mx-6 mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          <p className="font-medium">{t("dashboard.settings.salesFollowUp.unconfiguredTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("dashboard.settings.salesFollowUp.unconfiguredBody")}
          </p>
        </div>
      ) : null}
      {configState === "disabled" ? (
        <p
          role="status"
          data-testid="sales-follow-up-disabled"
          className="mx-6 mt-6 text-xs text-muted-foreground"
        >
          {t("dashboard.settings.salesFollowUp.disabledNotice")}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6 p-6">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={(checked) => form.setValue("enabled", checked === true)}
          />
          <span>
            <span className="font-medium">{t("dashboard.settings.salesFollowUp.enabled")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("dashboard.settings.salesFollowUp.enabledHelp")}
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <Label>{t("dashboard.settings.salesFollowUp.approvalMode")}</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={!canEdit}
            value={approvalMode}
            onChange={(event) =>
              form.setValue("approvalMode", event.target.value === "automatic" ? "automatic" : "draft")
            }
          >
            <option value="draft">{t("dashboard.settings.salesFollowUp.approvalDraft")}</option>
            <option value="automatic">{t("dashboard.settings.salesFollowUp.approvalAutomatic")}</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {approvalMode === "automatic"
              ? t("dashboard.settings.salesFollowUp.approvalAutomaticHelp")
              : t("dashboard.settings.salesFollowUp.approvalDraftHelp")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesFollowUp.openDraftsQueueHelp")}{" "}
            <Link
              href="~/dashboard/leads/follow-up-drafts"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              {t("dashboard.settings.salesFollowUp.openDraftsQueue")}
            </Link>
          </p>
        </div>

        <div
          id="sales-follow-up-channels"
          className={`space-y-2 rounded-md p-3 ${
            channelsMissing ? "border border-destructive/50 bg-destructive/5" : ""
          }`}
        >
          <Label>{t("dashboard.settings.salesFollowUp.channels")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesFollowUp.channelsHelp")}
          </p>
          {channelsMissing ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {t("dashboard.settings.salesFollowUp.channelsRequired")}
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {SALES_FOLLOW_UP_CHANNEL_OPTIONS.map((channel) => {
              const checked = channels.includes(channel);
              return (
                <label key={channel} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={!canEdit}
                    onCheckedChange={(next) => {
                      const set = new Set(channels);
                      if (next === true) set.add(channel);
                      else set.delete(channel);
                      form.setValue("channels", [...set], { shouldDirty: true });
                    }}
                  />
                  {t(`dashboard.settings.salesFollowUp.channel.${channel}`)}
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Label>{t("dashboard.settings.salesFollowUp.scheduleTitle")}</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dashboard.settings.salesFollowUp.scheduleHelp")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dashboard.settings.salesFollowUp.maxAttemptsHelp", { count: maxAttempts || 0 })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit}
                onClick={() => setSteps(defaultScheduleStepsTemplate())}
              >
                {t("dashboard.settings.salesFollowUp.resetSchedule")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit || scheduleSteps.length >= 5}
                onClick={addStep}
              >
                <Plus className="size-3.5" />
                {t("dashboard.settings.salesFollowUp.addStep")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {scheduleSteps.map((step, index) => (
              <div
                key={`step-${step.attemptNumber}-${index}`}
                className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-[auto_1fr_1fr_auto_auto] sm:items-end"
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {t("dashboard.settings.salesFollowUp.stepLabel", { n: step.attemptNumber })}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("dashboard.settings.salesFollowUp.stepAmount")}</Label>
                  <Input
                    type="number"
                    min={1}
                    disabled={!canEdit || !step.enabled}
                    value={step.amount}
                    onChange={(event) =>
                      updateStep(index, { amount: Math.max(1, Number(event.target.value) || 1) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("dashboard.settings.salesFollowUp.stepUnit")}</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={!canEdit || !step.enabled}
                    value={step.unit}
                    onChange={(event) =>
                      updateStep(index, {
                        unit: event.target.value as SalesFollowUpDurationUnit,
                      })
                    }
                  >
                    <option value="minutes">{t("dashboard.settings.salesFollowUp.unitMinutes")}</option>
                    <option value="hours">{t("dashboard.settings.salesFollowUp.unitHours")}</option>
                    <option value="days">{t("dashboard.settings.salesFollowUp.unitDays")}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={step.enabled}
                    disabled={!canEdit}
                    onCheckedChange={(checked) => updateStep(index, { enabled: checked === true })}
                  />
                  {t("dashboard.settings.salesFollowUp.stepEnabled")}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!canEdit || scheduleSteps.length <= 1}
                  onClick={() => removeStep(index)}
                  aria-label={t("dashboard.settings.salesFollowUp.removeStep")}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesFollowUp.anchorHelp")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="timezone">{t("dashboard.settings.salesFollowUp.timezone")}</Label>
            <select
              id="timezone"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={!canEdit}
              value={timezone?.trim() ? timezone.trim() : ""}
              onChange={(event) => {
                const next = event.target.value.trim();
                form.setValue("timezone", next || "UTC", { shouldDirty: true });
              }}
            >
              <option value="">
                {t("dashboard.settings.salesFollowUp.timezoneOptional")}
              </option>
              {timezoneOptions.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.settings.salesFollowUp.timezoneHelp")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyDailyLimit">
              {t("dashboard.settings.salesFollowUp.companyDailyLimit")}
            </Label>
            <Input
              id="companyDailyLimit"
              type="number"
              min={1}
              max={500}
              disabled={!canEdit}
              {...form.register("companyDailyLimit", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bhStart">{t("dashboard.settings.salesFollowUp.businessHoursStart")}</Label>
            <Input
              id="bhStart"
              type="time"
              disabled={!canEdit}
              value={businessHours?.start ?? "09:00"}
              onChange={(event) =>
                form.setValue("businessHours", {
                  ...(businessHours ?? { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] }),
                  start: event.target.value || "09:00",
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bhEnd">{t("dashboard.settings.salesFollowUp.businessHoursEnd")}</Label>
            <Input
              id="bhEnd"
              type="time"
              disabled={!canEdit}
              value={businessHours?.end ?? "17:00"}
              onChange={(event) =>
                form.setValue("businessHours", {
                  ...(businessHours ?? { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] }),
                  end: event.target.value || "17:00",
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("dashboard.settings.salesFollowUp.businessDays")}</Label>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => {
              const checked = (businessHours?.days ?? []).includes(day);
              return (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={!canEdit}
                    onCheckedChange={(next) => {
                      const set = new Set(businessHours?.days ?? []);
                      if (next === true) set.add(day);
                      else set.delete(day);
                      form.setValue("businessHours", {
                        ...(businessHours ?? { start: "09:00", end: "17:00", days: [] }),
                        days: [...set].sort((a, b) => a - b),
                      });
                    }}
                  />
                  {t(`dashboard.settings.salesFollowUp.weekday.${day}`)}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.settings.salesFollowUp.businessHoursHelp")}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t("dashboard.settings.salesFollowUp.stopConditions")}</Label>
          {(
            [
              ["stopOnCustomerReply", "stopOnCustomerReply"],
              ["stopOnConversion", "stopOnConversion"],
              ["stopOnPurchase", "stopOnPurchase"],
              ["stopOnOptOut", "stopOnOptOut"],
              ["stopOnClosedRequest", "stopOnClosedRequest"],
              ["stopOnReassignment", "stopOnReassignment"],
            ] as const
          ).map(([field, key]) => (
            <label key={field} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch(field)}
                disabled={!canEdit}
                onCheckedChange={(checked) => form.setValue(field, checked === true)}
              />
              {t(`dashboard.settings.salesFollowUp.${key}`)}
            </label>
          ))}
        </div>

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">{t("dashboard.settings.salesFollowUp.readOnly")}</p>
        ) : null}

        <Button type="submit" disabled={!canEdit || saveSettings.isPending}>
          {saveSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("dashboard.settings.salesFollowUp.save")}
        </Button>
      </form>
    </DashboardCard>
  );
}
