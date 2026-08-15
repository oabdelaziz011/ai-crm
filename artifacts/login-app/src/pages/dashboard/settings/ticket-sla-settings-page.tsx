import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Timer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import {
  useSaveTicketSlaSettings,
  useTicketSlaSettings,
} from "@/hooks/tickets/use-ticket-sla-settings";
import {
  DEFAULT_TICKET_SLA_SETTINGS,
  type TicketSlaSettingsFormValues,
} from "@/lib/tickets/ticket-sla-settings";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRIORITY_FIELDS: Array<{
  name: keyof TicketSlaSettingsFormValues;
  labelKey: string;
  helpKey: string;
}> = [
  {
    name: "urgentHours",
    labelKey: "dashboard.settings.tickets.sla.fields.urgent",
    helpKey: "dashboard.settings.tickets.sla.fields.urgentHelp",
  },
  {
    name: "highHours",
    labelKey: "dashboard.settings.tickets.sla.fields.high",
    helpKey: "dashboard.settings.tickets.sla.fields.highHelp",
  },
  {
    name: "normalHours",
    labelKey: "dashboard.settings.tickets.sla.fields.normal",
    helpKey: "dashboard.settings.tickets.sla.fields.normalHelp",
  },
  {
    name: "lowHours",
    labelKey: "dashboard.settings.tickets.sla.fields.low",
    helpKey: "dashboard.settings.tickets.sla.fields.lowHelp",
  },
];

function clampHours(value: number, max = 720): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}

export function SettingsTicketSlaPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = profile?.company_id ?? null;
  const canEdit = isSuperAdmin || hasPermission("tickets.manage") || hasPermission("settings.edit");

  const { data, isLoading, error } = useTicketSlaSettings(companyId);
  const saveSettings = useSaveTicketSlaSettings(companyId);

  const form = useForm<TicketSlaSettingsFormValues>({
    defaultValues: { ...DEFAULT_TICKET_SLA_SETTINGS },
  });

  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);

  const onSubmit = form.handleSubmit((values) => {
    const normalized: TicketSlaSettingsFormValues = {
      urgentHours: clampHours(values.urgentHours),
      highHours: clampHours(values.highHours),
      normalHours: clampHours(values.normalHours),
      lowHours: clampHours(values.lowHours),
      warningHours: clampHours(values.warningHours, 168),
    };
    saveSettings.mutate(normalized, {
      onSuccess: () => toast({ title: t("dashboard.settings.tickets.sla.saved") }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: t("dashboard.settings.tickets.sla.saveFailed"),
          description: e.message,
        }),
    });
  });

  if (isLoading) return <DashboardTableSkeleton />;

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Timer className="size-4 text-primary" />
          {t("dashboard.settings.tickets.sla.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.settings.tickets.sla.subtitle")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground/90">
          {t("dashboard.settings.tickets.sla.applyHint")}
        </p>
      </div>

      {error ? (
        <div className="p-5">
          <DashboardErrorBanner message={error.message} />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {PRIORITY_FIELDS.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={field.name}>{t(field.labelKey)}</Label>
              <Input
                id={field.name}
                type="number"
                min={1}
                max={720}
                step={1}
                disabled={!canEdit}
                className="rounded-xl"
                {...form.register(field.name, { valueAsNumber: true })}
              />
              <p className="text-[11px] text-muted-foreground">{t(field.helpKey)}</p>
            </div>
          ))}
        </div>

        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="warningHours">{t("dashboard.settings.tickets.sla.fields.warning")}</Label>
          <Input
            id="warningHours"
            type="number"
            min={1}
            max={168}
            step={1}
            disabled={!canEdit}
            className="rounded-xl"
            {...form.register("warningHours", { valueAsNumber: true })}
          />
          <p className="text-[11px] text-muted-foreground">
            {t("dashboard.settings.tickets.sla.fields.warningHelp")}
          </p>
        </div>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" className="rounded-xl" disabled={saveSettings.isPending}>
              {saveSettings.isPending ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
              {t("dashboard.settings.tickets.sla.save")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("dashboard.settings.tickets.sla.readOnly")}</p>
        )}
      </form>
    </DashboardCard>
  );
}
