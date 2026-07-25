import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useSchedulingEditAccess } from "@/components/scheduling/layout/scheduling-route-guard";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateAvailabilityException,
  useDeleteAvailabilityException,
  useResourceAvailability,
  useSaveWeeklySchedule,
} from "@/hooks/scheduling/use-scheduling-availability";
import { useSchedulingResources } from "@/hooks/scheduling/use-scheduling-resources";
import {
  DEFAULT_WEEKLY_HOURS,
  SCHEDULING_EXCEPTION_TYPES,
  WEEKDAY_INDICES,
  type WeekdayIndex,
} from "@/lib/scheduling/types";
import type { WeeklyScheduleFormValues } from "@/lib/scheduling/validation/schemas";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function trimTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function buildWeeklyForm(
  weeklyHours: Array<{
    day_of_week: WeekdayIndex;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
  }>,
  breaks: Array<{ weekly_hours_id: string; starts_at: string; ends_at: string; label: string | null }>,
  hoursById: Map<string, WeekdayIndex>,
): WeeklyScheduleFormValues {
  const byDay = new Map(weeklyHours.map((row) => [row.day_of_week, row]));

  return {
    days: WEEKDAY_INDICES.map((day) => {
      const existing = byDay.get(day);
      const defaultDay = DEFAULT_WEEKLY_HOURS.find((item) => item.day_of_week === day)!;
      const row = existing ?? {
        day_of_week: day,
        is_closed: defaultDay.is_closed,
        opens_at: defaultDay.opens_at,
        closes_at: defaultDay.closes_at,
      };

      const dayBreaks = existing
        ? breaks
            .filter((item) => hoursById.get(item.weekly_hours_id) === day)
            .map((item) => ({
              starts_at: trimTime(item.starts_at),
              ends_at: trimTime(item.ends_at),
              label: item.label,
            }))
        : defaultDay.breaks ?? [];

      return {
        day_of_week: day,
        is_closed: row.is_closed,
        opens_at: row.is_closed ? null : trimTime(row.opens_at) || "09:00",
        closes_at: row.is_closed ? null : trimTime(row.closes_at) || "17:00",
        breaks: dayBreaks,
      };
    }),
  };
}

export function SchedulingAvailabilityPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEdit = useSchedulingEditAccess();

  const { data: resources = [], isLoading: resourcesLoading } = useSchedulingResources(companyId);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedResourceId && resources.length > 0) {
      setSelectedResourceId(resources[0].id);
    }
  }, [resources, selectedResourceId]);

  const selectedResource = resources.find((item) => item.id === selectedResourceId) ?? null;

  const {
    data: availability,
    isLoading: availabilityLoading,
    error,
  } = useResourceAvailability(companyId, selectedResourceId);

  const saveWeekly = useSaveWeeklySchedule(companyId, selectedResourceId);
  const createException = useCreateAvailabilityException(companyId, selectedResourceId);
  const deleteException = useDeleteAvailabilityException(companyId, selectedResourceId);

  const hoursById = useMemo(() => {
    const map = new Map<string, WeekdayIndex>();
    for (const row of availability?.weeklyHours ?? []) {
      map.set(row.id, row.day_of_week);
    }
    return map;
  }, [availability?.weeklyHours]);

  const [weeklyForm, setWeeklyForm] = useState<WeeklyScheduleFormValues>({
    days: DEFAULT_WEEKLY_HOURS.map((day) => ({
      day_of_week: day.day_of_week,
      is_closed: day.is_closed,
      opens_at: day.opens_at ?? null,
      closes_at: day.closes_at ?? null,
      breaks: day.breaks ?? [],
    })),
  });

  useEffect(() => {
    if (availability) {
      setWeeklyForm(
        buildWeeklyForm(availability.weeklyHours, availability.breaks, hoursById),
      );
    }
  }, [availability, hoursById]);

  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionDraft, setExceptionDraft] = useState({
    exception_type: "vacation" as const,
    title: "",
    starts_at: "",
    ends_at: "",
    all_day: true,
    notes: "",
  });

  const weekdayLabel = (day: WeekdayIndex) =>
    t(`scheduling.availability.weekdays.${day}`);

  const updateDay = (
    dayIndex: WeekdayIndex,
    patch: Partial<WeeklyScheduleFormValues["days"][number]>,
  ) => {
    setWeeklyForm((prev) => ({
      days: prev.days.map((day) =>
        day.day_of_week === dayIndex ? { ...day, ...patch } : day,
      ),
    }));
  };

  const addBreak = (dayIndex: WeekdayIndex) => {
    setWeeklyForm((prev) => ({
      days: prev.days.map((day) =>
        day.day_of_week === dayIndex
          ? {
              ...day,
              breaks: [...day.breaks, { starts_at: "13:00", ends_at: "14:00", label: null }],
            }
          : day,
      ),
    }));
  };

  const removeBreak = (dayIndex: WeekdayIndex, breakIndex: number) => {
    setWeeklyForm((prev) => ({
      days: prev.days.map((day) =>
        day.day_of_week === dayIndex
          ? { ...day, breaks: day.breaks.filter((_, idx) => idx !== breakIndex) }
          : day,
      ),
    }));
  };

  const saveSchedule = () => {
    saveWeekly.mutate(weeklyForm, {
      onSuccess: () => toast({ title: t("scheduling.availability.saved") }),
      onError: (e) =>
        toast({
          variant: "destructive",
          title: t("scheduling.errors.title"),
          description: e.message,
        }),
    });
  };

  const submitException = () => {
    if (!exceptionDraft.starts_at || !exceptionDraft.ends_at || !exceptionDraft.title.trim()) {
      return;
    }
    createException.mutate(
      {
        exception_type: exceptionDraft.exception_type,
        title: exceptionDraft.title.trim(),
        starts_at: new Date(exceptionDraft.starts_at).toISOString(),
        ends_at: new Date(exceptionDraft.ends_at).toISOString(),
        all_day: exceptionDraft.all_day,
        notes: exceptionDraft.notes.trim() || null,
      },
      {
        onSuccess: () => {
          setExceptionOpen(false);
          setExceptionDraft({
            exception_type: "vacation",
            title: "",
            starts_at: "",
            ends_at: "",
            all_day: true,
            notes: "",
          });
          toast({ title: t("scheduling.availability.exceptionCreated") });
        },
        onError: (e) =>
          toast({
            variant: "destructive",
            title: t("scheduling.errors.title"),
            description: e.message,
          }),
      },
    );
  };

  if (resourcesLoading) {
    return <DashboardTableSkeleton />;
  }

  if (resources.length === 0) {
    return (
      <DashboardCard className="p-8 text-center text-sm text-muted-foreground">
        {t("scheduling.availability.noResources")}
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardCard className="p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2 min-w-[220px]">
            <Label>{t("scheduling.availability.selectResource")}</Label>
            <select
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
              value={selectedResourceId ?? ""}
              onChange={(e) => setSelectedResourceId(e.target.value)}
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </div>
          {selectedResource && (
            <p className="text-xs text-muted-foreground pb-2">
              {t("scheduling.availability.resourceTimezone", {
                timezone: selectedResource.timezone,
              })}
            </p>
          )}
        </div>
      </DashboardCard>

      {error && <DashboardErrorBanner message={error.message} />}

      <DashboardCard className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              {t("scheduling.availability.weeklyTitle")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("scheduling.availability.weeklySubtitle")}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" onClick={saveSchedule} disabled={saveWeekly.isPending} className="gap-2">
              {saveWeekly.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("buttons.save")}
            </Button>
          )}
        </div>

        {availabilityLoading ? (
          <DashboardTableSkeleton />
        ) : (
          <div className="divide-y divide-white/5">
            {weeklyForm.days.map((day) => (
              <div key={day.day_of_week} className="px-6 py-4 space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <p className="w-28 text-sm font-medium">{weekdayLabel(day.day_of_week)}</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={day.is_closed}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateDay(day.day_of_week, { is_closed: e.target.checked })
                      }
                    />
                    {t("scheduling.availability.closed")}
                  </label>
                  {!day.is_closed && (
                    <>
                      <Input
                        type="time"
                        disabled={!canEdit}
                        value={day.opens_at ?? ""}
                        onChange={(e) =>
                          updateDay(day.day_of_week, { opens_at: e.target.value })
                        }
                        className="w-32 bg-background/50 border-white/10"
                      />
                      <span className="text-muted-foreground text-sm">→</span>
                      <Input
                        type="time"
                        disabled={!canEdit}
                        value={day.closes_at ?? ""}
                        onChange={(e) =>
                          updateDay(day.day_of_week, { closes_at: e.target.value })
                        }
                        className="w-32 bg-background/50 border-white/10"
                      />
                    </>
                  )}
                </div>

                {!day.is_closed && (
                  <div className="ps-28 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t("scheduling.availability.breaks")}
                      </p>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addBreak(day.day_of_week)}
                        >
                          <Plus className="w-3 h-3 me-1" />
                          {t("scheduling.availability.addBreak")}
                        </Button>
                      )}
                    </div>
                    {day.breaks.map((item, breakIndex) => (
                      <div key={breakIndex} className="flex flex-wrap items-center gap-2">
                        <Input
                          type="time"
                          disabled={!canEdit}
                          value={item.starts_at}
                          onChange={(e) => {
                            const breaks = day.breaks.map((row, idx) =>
                              idx === breakIndex
                                ? { ...row, starts_at: e.target.value }
                                : row,
                            );
                            updateDay(day.day_of_week, { breaks });
                          }}
                          className="w-32 bg-background/50 border-white/10"
                        />
                        <span className="text-muted-foreground text-sm">→</span>
                        <Input
                          type="time"
                          disabled={!canEdit}
                          value={item.ends_at}
                          onChange={(e) => {
                            const breaks = day.breaks.map((row, idx) =>
                              idx === breakIndex
                                ? { ...row, ends_at: e.target.value }
                                : row,
                            );
                            updateDay(day.day_of_week, { breaks });
                          }}
                          className="w-32 bg-background/50 border-white/10"
                        />
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeBreak(day.day_of_week, breakIndex)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <DashboardCard className="overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">{t("scheduling.availability.exceptionsTitle")}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("scheduling.availability.exceptionsSubtitle")}
            </p>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" className="border-white/10" onClick={() => setExceptionOpen(true)}>
              <Plus className="w-4 h-4 me-1" />
              {t("scheduling.availability.addException")}
            </Button>
          )}
        </div>

        {availabilityLoading ? (
          <DashboardTableSkeleton />
        ) : (availability?.exceptions.length ?? 0) === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("scheduling.availability.noExceptions")}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {availability?.exceptions.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`scheduling.availability.exceptionTypes.${item.exception_type}`)}
                    {" · "}
                    {format(parseISO(item.starts_at), "MMM d, yyyy HH:mm")}
                    {" → "}
                    {format(parseISO(item.ends_at), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() =>
                      deleteException.mutate(item.id, {
                        onSuccess: () =>
                          toast({ title: t("scheduling.availability.exceptionDeleted") }),
                      })
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <Dialog open={exceptionOpen} onOpenChange={setExceptionOpen}>
        <DialogContent className="sm:max-w-md border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle>{t("scheduling.availability.addException")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("scheduling.availability.fields.type")}</Label>
              <select
                className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm"
                value={exceptionDraft.exception_type}
                onChange={(e) =>
                  setExceptionDraft((prev) => ({
                    ...prev,
                    exception_type: e.target.value as typeof prev.exception_type,
                  }))
                }
              >
                {SCHEDULING_EXCEPTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`scheduling.availability.exceptionTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("scheduling.availability.fields.title")}</Label>
              <Input
                value={exceptionDraft.title}
                onChange={(e) =>
                  setExceptionDraft((prev) => ({ ...prev, title: e.target.value }))
                }
                className="bg-background/50 border-white/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t("scheduling.availability.fields.startsAt")}</Label>
                <Input
                  type="datetime-local"
                  value={exceptionDraft.starts_at}
                  onChange={(e) =>
                    setExceptionDraft((prev) => ({ ...prev, starts_at: e.target.value }))
                  }
                  className="bg-background/50 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("scheduling.availability.fields.endsAt")}</Label>
                <Input
                  type="datetime-local"
                  value={exceptionDraft.ends_at}
                  onChange={(e) =>
                    setExceptionDraft((prev) => ({ ...prev, ends_at: e.target.value }))
                  }
                  className="bg-background/50 border-white/10"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionOpen(false)} className="border-white/10">
              {t("buttons.cancel")}
            </Button>
            <Button onClick={submitException} disabled={createException.isPending}>
              {createException.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t("buttons.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
