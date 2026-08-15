import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import {
  BookingRuleField,
  BookingRuleSection,
} from "@/components/scheduling/booking-rules/booking-rule-field";
import {
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  useSaveSchedulingBookingRules,
  useSchedulingBookingRules,
} from "@/hooks/scheduling/use-scheduling-booking-rules";
import { BOOKING_RULES_TIMEZONES } from "@/lib/scheduling/booking-rules-timezones";
import { DEFAULT_BOOKING_RULES, WEEKDAY_INDICES } from "@/lib/scheduling/types";
import {
  bookingRulesFormSchema,
  type BookingRulesFormValues,
} from "@/lib/scheduling/validation/schemas";

function translateFieldError(
  translate: (key: string) => string,
  message?: string,
): string | undefined {
  if (!message) {
    return undefined;
  }
  return message.startsWith("scheduling.") ? translate(message) : message;
}

export function SchedulingBookingRulesPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data, isLoading, error } = useSchedulingBookingRules(companyId);
  const saveRules = useSaveSchedulingBookingRules(companyId);

  const form = useForm<BookingRulesFormValues>({
    resolver: zodResolver(bookingRulesFormSchema),
    defaultValues: { ...DEFAULT_BOOKING_RULES },
  });

  useEffect(() => {
    if (data) {
      form.reset(data);
    }
  }, [data, form]);

  const fieldError = (name: keyof BookingRulesFormValues) =>
    translateFieldError(t, form.formState.errors[name]?.message);

  const selectedTimezone = form.watch("timezone");
  const timezoneOptions = BOOKING_RULES_TIMEZONES.includes(
    selectedTimezone as (typeof BOOKING_RULES_TIMEZONES)[number],
  )
    ? BOOKING_RULES_TIMEZONES
    : ([selectedTimezone, ...BOOKING_RULES_TIMEZONES] as readonly string[]);

  const onSubmit = form.handleSubmit((values) => {
    saveRules.mutate(values, {
      onSuccess: () => toast({ title: t("scheduling.bookingRules.saved") }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: t("scheduling.errors.title"),
          description: e.message,
        }),
    });
  });

  if (isLoading) {
    return <DashboardTableSkeleton />;
  }

  return (
    <div className="overflow-hidden border border-border bg-background">
      <div className="p-5 border-b border-border/40">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          {t("scheduling.bookingRules.title")}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t("scheduling.bookingRules.subtitle")}</p>
        <p className="text-xs text-muted-foreground/80 mt-2 leading-relaxed">
          {t("scheduling.bookingRules.docs.overview")}
        </p>
      </div>

      {error && (
        <div className="p-5">
          <DashboardErrorBanner message={error.message} />
        </div>
      )}

      <form onSubmit={onSubmit} className="p-6 space-y-8">
        <BookingRuleSection
          titleKey="scheduling.bookingRules.sections.bookingWindow.title"
          subtitleKey="scheduling.bookingRules.sections.bookingWindow.subtitle"
        >
          <BookingRuleField
            htmlFor="min_booking_notice_minutes"
            titleKey="scheduling.bookingRules.fields.minNotice"
            helpKey="scheduling.bookingRules.fields.minNoticeHelp"
            tooltipKey="scheduling.bookingRules.fields.minNoticeTooltip"
            error={fieldError("min_booking_notice_minutes")}
          >
            <Input
              id="min_booking_notice_minutes"
              type="number"
              min={0}
              disabled={!canEdit}
              {...form.register("min_booking_notice_minutes")}
              className="bg-background border-border/60"
            />
          </BookingRuleField>

          <BookingRuleField
            htmlFor="max_booking_window_days"
            titleKey="scheduling.bookingRules.fields.maxWindow"
            helpKey="scheduling.bookingRules.fields.maxWindowHelp"
            tooltipKey="scheduling.bookingRules.fields.maxWindowTooltip"
            error={fieldError("max_booking_window_days")}
          >
            <Input
              id="max_booking_window_days"
              type="number"
              min={1}
              disabled={!canEdit}
              {...form.register("max_booking_window_days")}
              className="bg-background border-border/60"
            />
          </BookingRuleField>
        </BookingRuleSection>

        <BookingRuleSection
          titleKey="scheduling.bookingRules.sections.slotGeneration.title"
          subtitleKey="scheduling.bookingRules.sections.slotGeneration.subtitle"
        >
          <BookingRuleField
            htmlFor="slot_interval_minutes"
            titleKey="scheduling.bookingRules.fields.slotInterval"
            helpKey="scheduling.bookingRules.fields.slotIntervalHelp"
            tooltipKey="scheduling.bookingRules.fields.slotIntervalTooltip"
            error={fieldError("slot_interval_minutes")}
          >
            <Input
              id="slot_interval_minutes"
              type="number"
              min={5}
              max={480}
              step={5}
              disabled={!canEdit}
              {...form.register("slot_interval_minutes")}
              className="bg-background border-border/60"
            />
            <p className="text-xs text-muted-foreground/90 mt-2 font-mono leading-relaxed">
              {t("scheduling.bookingRules.examples.slotInterval")}
            </p>
          </BookingRuleField>
        </BookingRuleSection>

        <BookingRuleSection
          titleKey="scheduling.bookingRules.sections.buffers.title"
          subtitleKey="scheduling.bookingRules.sections.buffers.subtitle"
        >
          <BookingRuleField
            htmlFor="buffer_before_minutes"
            titleKey="scheduling.bookingRules.fields.bufferBefore"
            helpKey="scheduling.bookingRules.fields.bufferBeforeHelp"
            tooltipKey="scheduling.bookingRules.fields.bufferBeforeTooltip"
            error={fieldError("buffer_before_minutes")}
          >
            <Input
              id="buffer_before_minutes"
              type="number"
              min={0}
              disabled={!canEdit}
              {...form.register("buffer_before_minutes")}
              className="bg-background border-border/60"
            />
          </BookingRuleField>

          <BookingRuleField
            htmlFor="buffer_after_minutes"
            titleKey="scheduling.bookingRules.fields.bufferAfter"
            helpKey="scheduling.bookingRules.fields.bufferAfterHelp"
            tooltipKey="scheduling.bookingRules.fields.bufferAfterTooltip"
            error={fieldError("buffer_after_minutes")}
          >
            <Input
              id="buffer_after_minutes"
              type="number"
              min={0}
              disabled={!canEdit}
              {...form.register("buffer_after_minutes")}
              className="bg-background border-border/60"
            />
          </BookingRuleField>
        </BookingRuleSection>

        <BookingRuleSection
          titleKey="scheduling.bookingRules.sections.policies.title"
          subtitleKey="scheduling.bookingRules.sections.policies.subtitle"
        >
          <BookingRuleField
            htmlFor="min_cancellation_notice_minutes"
            titleKey="scheduling.bookingRules.fields.minCancellationNotice"
            helpKey="scheduling.bookingRules.fields.minCancellationNoticeHelp"
            tooltipKey="scheduling.bookingRules.fields.minCancellationNoticeTooltip"
            error={fieldError("min_cancellation_notice_minutes")}
          >
            <Input
              id="min_cancellation_notice_minutes"
              type="number"
              min={0}
              disabled={!canEdit}
              {...form.register("min_cancellation_notice_minutes")}
              className="bg-background border-border/60"
            />
            <p className="text-xs text-muted-foreground/90 mt-2">
              {t("scheduling.bookingRules.examples.cancellationNotice")}
            </p>
          </BookingRuleField>

          <BookingRuleField
            htmlFor="min_reschedule_notice_minutes"
            titleKey="scheduling.bookingRules.fields.minRescheduleNotice"
            helpKey="scheduling.bookingRules.fields.minRescheduleNoticeHelp"
            tooltipKey="scheduling.bookingRules.fields.minRescheduleNoticeTooltip"
            error={fieldError("min_reschedule_notice_minutes")}
          >
            <Input
              id="min_reschedule_notice_minutes"
              type="number"
              min={0}
              disabled={!canEdit}
              {...form.register("min_reschedule_notice_minutes")}
              className="bg-background border-border/60"
            />
            <p className="text-xs text-muted-foreground/90 mt-2">
              {t("scheduling.bookingRules.examples.rescheduleNotice")}
            </p>
          </BookingRuleField>

          <div className="sm:col-span-2">
            <BookingRuleField
              titleKey="scheduling.bookingRules.fields.allowOverbooking"
              helpKey="scheduling.bookingRules.fields.allowOverbookingHelp"
              tooltipKey="scheduling.bookingRules.fields.allowOverbookingTooltip"
            >
              <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {form.watch("allow_overbooking")
                    ? t("scheduling.bookingRules.fields.allowOverbookingOn")
                    : t("scheduling.bookingRules.fields.allowOverbookingOff")}
                </span>
                <Switch
                  disabled={!canEdit}
                  checked={form.watch("allow_overbooking")}
                  onCheckedChange={(checked) => form.setValue("allow_overbooking", checked)}
                />
              </div>
            </BookingRuleField>
          </div>
        </BookingRuleSection>

        <BookingRuleSection
          titleKey="scheduling.bookingRules.sections.calendar.title"
          subtitleKey="scheduling.bookingRules.sections.calendar.subtitle"
        >
          <BookingRuleField
            htmlFor="timezone"
            titleKey="scheduling.bookingRules.fields.timezone"
            helpKey="scheduling.bookingRules.fields.timezoneHelp"
            tooltipKey="scheduling.bookingRules.fields.timezoneTooltip"
            error={fieldError("timezone")}
          >
            <select
              id="timezone"
              disabled={!canEdit}
              className="w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm"
              {...form.register("timezone")}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground/90 mt-2 leading-relaxed">
              {t("scheduling.bookingRules.docs.timezoneRecommendation")}
            </p>
          </BookingRuleField>

          <BookingRuleField
            htmlFor="week_start_day"
            titleKey="scheduling.bookingRules.fields.weekStart"
            helpKey="scheduling.bookingRules.fields.weekStartHelp"
            tooltipKey="scheduling.bookingRules.fields.weekStartTooltip"
            error={fieldError("week_start_day")}
          >
            <select
              id="week_start_day"
              disabled={!canEdit}
              className="w-full rounded-xl bg-background border border-border/60 px-3 py-2.5 text-sm"
              {...form.register("week_start_day", { valueAsNumber: true })}
            >
              {WEEKDAY_INDICES.map((day) => (
                <option key={day} value={day}>
                  {t(`scheduling.availability.weekdays.${day}`)}
                </option>
              ))}
            </select>
          </BookingRuleField>
        </BookingRuleSection>

        {canEdit && (
          <Button type="submit" disabled={saveRules.isPending} className="gap-2">
            {saveRules.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("buttons.save")}
          </Button>
        )}
      </form>
    </div>
  );
}
