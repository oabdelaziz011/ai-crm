import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  useCanManageProductDemos,
  useProductDemoMutations,
  useProductDemoOfferings,
  useProductDemoSlots,
  useProductDemoWindows,
} from "@/hooks/product-demos/use-product-demos";
import { useProductCatalog } from "@/hooks/products/use-product-commands";
import { useAuthUser } from "@/hooks/use-rbac";
import { useProfiles } from "@/hooks/use-profiles";
import { useToast } from "@/hooks/use-toast";
import {
  productDemoErrorMessage,
  type ProductDemoWindow,
} from "@/lib/product-demos/product-demos-api";
import {
  DashboardCard,
  DashboardErrorBanner,
  DashboardTableSkeleton,
} from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
const SLOT_FETCH_LIMIT = 1000;
const SLOT_STATUSES = ["published", "draft", "booked", "blocked", "cancelled"] as const;
const TIMEZONE_OPTIONS = [
  "Africa/Cairo",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Asia/Amman",
  "Asia/Beirut",
  "Africa/Casablanca",
  "Africa/Tunis",
  "Europe/Istanbul",
  "Europe/London",
  "UTC",
] as const;
const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const thClass = "px-4 py-3 text-start align-middle font-semibold";
const tdClass = "px-4 py-3 text-start align-middle";

function weekdayOfYmd(ymd: string): number {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getDay();
}

function formatYmd(ymd: string, language: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1).toLocaleDateString(
    language.startsWith("ar") ? "ar-EG" : "en-GB",
    { dateStyle: "medium" },
  );
}

function civilYmd(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(language.startsWith("ar") ? "ar-EG" : "en-GB", { timeStyle: "short" });
}

function statusLabel(t: (key: string) => string, status: string) {
  const key = `productDemos.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

function activeWindow(windows: ProductDemoWindow[], weekday: number) {
  return windows.find((window) => window.weekday === weekday && window.isActive) ?? null;
}

export function ProductDemoSchedulingPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const canManage = useCanManageProductDemos();
  const { profile: authProfile } = useAuthUser();
  const offeringsQuery = useProductDemoOfferings();
  const productsQuery = useProductCatalog({ activeOnly: true });
  const profilesQuery = useProfiles();
  const mutations = useProductDemoMutations();

  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [catalogProductId, setCatalogProductId] = useState("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [presenterUserId, setPresenterUserId] = useState("");
  const [publishDates, setPublishDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [slotPage, setSlotPage] = useState(0);
  const [slotStatus, setSlotStatus] = useState("");
  const [slotDay, setSlotDay] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [hours, setHours] = useState<Record<number, { start: string; end: string }>>({});

  const slotsQuery = useProductDemoSlots(
    selectedOfferingId
      ? {
          offeringId: selectedOfferingId,
          status: slotStatus || undefined,
          limit: SLOT_FETCH_LIMIT,
          offset: 0,
        }
      : undefined,
    Boolean(selectedOfferingId),
  );
  const windowsQuery = useProductDemoWindows(selectedOfferingId || null);

  const products = productsQuery.data?.items ?? [];
  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products) map.set(product.id, product.name);
    return map;
  }, [products]);

  const windows = windowsQuery.data?.windows ?? [];
  const assignedPresenters = (windowsQuery.data?.presenters ?? []).filter((row) => row.isActive);
  const weekdayOrder = i18n.language.startsWith("ar")
    ? [6, 0, 1, 2, 3, 4, 5]
    : [...WEEKDAY_INDEXES];

  useEffect(() => {
    setSlotPage(0);
    setSlotStatus("");
    setSlotDay("");
    setPublishDates([]);
  }, [selectedOfferingId]);

  useEffect(() => {
    const next: Record<number, { start: string; end: string }> = {};
    for (const day of WEEKDAY_INDEXES) {
      const window = activeWindow(windows, day);
      next[day] = {
        start: window?.startTime.slice(0, 5) || "09:00",
        end: window?.endTime.slice(0, 5) || "17:00",
      };
    }
    setHours(next);
  }, [selectedOfferingId, windowsQuery.dataUpdatedAt]);

  const profileLabel = (userId: string) => {
    const profiles = profilesQuery.data ?? [];
    const match = profiles.find((profile) => profile.user_id === userId || profile.id === userId);
    return match?.full_name || match?.email || userId.slice(0, 8);
  };

  const offerings = offeringsQuery.data?.items ?? [];
  const slots = slotsQuery.data?.items ?? [];
  const busy =
    mutations.createOffering.isPending ||
    mutations.assignPresenter.isPending ||
    mutations.setWeekday.isPending ||
    mutations.generateSlots.isPending ||
    mutations.setOfferingStatus.isPending ||
    mutations.publishSlot.isPending ||
    mutations.unpublishSlot.isPending ||
    mutations.blockSlot.isPending;
  const hasWorkDay = windows.some((window) => window.isActive);
  const hasPresenter = assignedPresenters.length > 0;

  const run = async (okText: string, fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      const text = typeof result === "string" && result ? result : okText;
      setNotice({ tone: "ok", text });
      toast({ title: text });
      return result;
    } catch (error) {
      const text = productDemoErrorMessage(error, t);
      setNotice({ tone: "err", text });
      toast({ title: okText, description: text, variant: "destructive" });
      return null;
    }
  };

  const saveWeekday = (weekday: number, isWorkDay: boolean) => {
    if (!selectedOfferingId) return;
    const dayHours = hours[weekday] ?? { start: "09:00", end: "17:00" };
    if (isWorkDay && !presenterUserId && !hasPresenter) {
      setNotice({ tone: "err", text: t("productDemos.needPresenter") });
      return;
    }
    const presenter =
      presenterUserId || assignedPresenters[0]?.userId || null;
    void run(
      isWorkDay ? t("productDemos.scheduling.savedWork") : t("productDemos.scheduling.savedOff"),
      () =>
        mutations.setWeekday.mutateAsync({
          offeringId: selectedOfferingId,
          weekday,
          isWorkDay,
          startTime: dayHours.start,
          endTime: dayHours.end,
          presenterUserId: presenter,
          timezone: timezone.trim() || undefined,
        }),
    );
  };

  if (offeringsQuery.isLoading) return <DashboardTableSkeleton rows={5} />;
  if (offeringsQuery.error) {
    return (
      <DashboardErrorBanner message={productDemoErrorMessage(offeringsQuery.error, t)}>
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={() => void offeringsQuery.refetch()}>
            {t("productDemos.retry")}
          </Button>
        </div>
      </DashboardErrorBanner>
    );
  }

  const presenterOptions = (profilesQuery.data ?? []).filter((profile) => {
    if (profile.is_active === false) return false;
    if (!authProfile?.company_id) return true;
    return profile.company_id === authProfile.company_id;
  });
  const timezoneOptions = TIMEZONE_OPTIONS.includes(timezone as (typeof TIMEZONE_OPTIONS)[number])
    ? TIMEZONE_OPTIONS
    : [timezone, ...TIMEZONE_OPTIONS];
  const slotsByDay = (() => {
    const groups = new Map<string, typeof slots>();
    for (const slot of slots) {
      const ymd = civilYmd(slot.startAt);
      const list = groups.get(ymd) ?? [];
      list.push(slot);
      groups.set(ymd, list);
    }
    return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  })();
  const visibleDays = slotDay ? slotsByDay.filter(([ymd]) => ymd === slotDay) : slotsByDay;
  const dayPages = visibleDays.length;
  const dayIndex = slotDay ? 0 : Math.min(slotPage, Math.max(0, dayPages - 1));
  const currentDay = visibleDays[dayIndex] ?? null;
  const daySlots = currentDay?.[1] ?? [];

  const todayYmd = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })();
  const weekStart = weekdayOrder[0] ?? 0;
  const monthCells = (() => {
    const firstWeekday = new Date(calendarMonth.year, calendarMonth.month, 1).getDay();
    const pad = (firstWeekday - weekStart + 7) % 7;
    const count = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const cells: Array<string | null> = Array.from({ length: pad }, () => null);
    for (let day = 1; day <= count; day += 1) {
      cells.push(
        `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      );
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  })();
  const monthLabel = new Date(calendarMonth.year, calendarMonth.month, 1).toLocaleDateString(
    i18n.language.startsWith("ar") ? "ar-EG" : "en-GB",
    { month: "long", year: "numeric" },
  );
  const selectedOffering = offerings.find((item) => item.id === selectedOfferingId);

  const togglePublishDate = (ymd: string) => {
    if (ymd < todayYmd) return;
    if (!activeWindow(windows, weekdayOfYmd(ymd))) {
      setNotice({ tone: "err", text: t("productDemos.scheduling.dateOff") });
      return;
    }
    setNotice(null);
    setPublishDates((current) =>
      current.includes(ymd) ? current.filter((item) => item !== ymd) : [...current, ymd].sort(),
    );
  };

  const shiftMonth = (delta: number) => {
    setCalendarMonth((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <div className="space-y-6 [&_table]:border-collapse">
      {notice ? (
        <p
          className={`rounded-xl border px-3 py-2 text-sm ${
            notice.tone === "err"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          }`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      {!canManage ? (
        <p className="text-sm text-muted-foreground">{t("productDemos.manageDenied")}</p>
      ) : (
        <DashboardCard className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">{t("productDemos.scheduling.createTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pd-product">{t("productDemos.scheduling.product")}</Label>
              <select
                id="pd-product"
                className={selectClass}
                value={catalogProductId}
                onChange={(event) => setCatalogProductId(event.target.value)}
              >
                <option value="">{t("productDemos.scheduling.selectProduct")}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              {products.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("productDemos.noProducts")}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pd-title">{t("productDemos.scheduling.titleOptional")}</Label>
              <Input
                id="pd-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("productDemos.scheduling.titlePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pd-duration">{t("productDemos.scheduling.duration")}</Label>
              <Input
                id="pd-duration"
                type="number"
                min={5}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pd-tz">{t("productDemos.scheduling.timezone")}</Label>
              <select
                id="pd-tz"
                className={selectClass}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {timezoneOptions.map((zone) => (
                  <option key={zone} value={zone}>
                    {t(`productDemos.timezones.${zone}`, { defaultValue: zone })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="button"
            disabled={busy || !catalogProductId}
            onClick={() =>
              void run(t("productDemos.scheduling.created"), async () => {
                const result = await mutations.createOffering.mutateAsync({
                  catalogProductId,
                  title: title.trim() || undefined,
                  durationMinutes: Number(durationMinutes) || 30,
                  timezone: timezone.trim() || undefined,
                });
                setSelectedOfferingId(result.offering.id);
                setCatalogProductId("");
                setTitle("");
              })
            }
          >
            {mutations.createOffering.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("productDemos.scheduling.create")
            )}
          </Button>
        </DashboardCard>
      )}

      <DashboardCard className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">{t("productDemos.scheduling.offerings")}</h2>
        {offerings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("productDemos.noOfferings")}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-start text-[13px]">
                <thead className="border-b border-border/40 bg-muted/20 text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className={thClass}>{t("productDemos.scheduling.columns.title")}</th>
                    <th className={thClass}>{t("productDemos.scheduling.columns.product")}</th>
                    <th className={thClass}>{t("productDemos.scheduling.columns.duration")}</th>
                    <th className={thClass}>{t("productDemos.scheduling.columns.status")}</th>
                    <th className={thClass}>{t("productDemos.scheduling.columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {offerings.map((offering) => (
                    <tr
                      key={offering.id}
                      className={`border-b border-border/30 last:border-0 ${
                        selectedOfferingId === offering.id ? "bg-muted/30" : ""
                      }`}
                    >
                      <td className={tdClass}>
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={() => setSelectedOfferingId(offering.id)}
                        >
                          {offering.title || t("productDemos.untitled")}
                        </button>
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        {productNameById.get(offering.catalogProductId) ??
                          offering.catalogProductId.slice(0, 8)}
                      </td>
                      <td className={`${tdClass} tabular-nums`}>
                        {t("productDemos.scheduling.durationValue", { count: offering.durationMinutes })}
                      </td>
                      <td className={tdClass}>{statusLabel(t, offering.status)}</td>
                      <td className={tdClass}>
                        <div className="flex flex-wrap gap-1">
                          {canManage && offering.status !== "published" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void run(t("productDemos.scheduling.published"), () =>
                                  mutations.setOfferingStatus.mutateAsync({
                                    offeringId: offering.id,
                                    status: "published",
                                  }),
                                )
                              }
                            >
                              {t("productDemos.scheduling.publish")}
                            </Button>
                          ) : null}
                          {canManage && offering.status === "published" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void run(t("productDemos.scheduling.drafted"), () =>
                                  mutations.setOfferingStatus.mutateAsync({
                                    offeringId: offering.id,
                                    status: "draft",
                                  }),
                                )
                              }
                            >
                              {t("productDemos.scheduling.unpublish")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant={selectedOfferingId === offering.id ? "default" : "ghost"}
                            onClick={() => setSelectedOfferingId(offering.id)}
                          >
                            {canManage
                              ? t("productDemos.scheduling.manage")
                              : t("productDemos.scheduling.view")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!selectedOfferingId && offerings.length > 0 ? (
          <p className="text-sm text-muted-foreground">{t("productDemos.selectOfferingHint")}</p>
        ) : null}
      </DashboardCard>

      {selectedOfferingId && canManage ? (
        <DashboardCard className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">{t("productDemos.scheduling.availabilityTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pd-presenter">{t("productDemos.scheduling.presenter")}</Label>
              <select
                id="pd-presenter"
                className={selectClass}
                value={presenterUserId}
                onChange={(event) => setPresenterUserId(event.target.value)}
              >
                <option value="">{t("productDemos.scheduling.selectUser")}</option>
                {presenterOptions.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email || profile.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              {presenterOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("productDemos.noUsers")}</p>
              ) : null}
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={busy || !presenterUserId}
                onClick={() =>
                  void run(t("productDemos.scheduling.assigned"), () =>
                    mutations.assignPresenter.mutateAsync({
                      offeringId: selectedOfferingId,
                      userId: presenterUserId,
                    }),
                  )
                }
              >
                {t("productDemos.scheduling.assign")}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {t("productDemos.assignedPresenters")}
            </p>
            {assignedPresenters.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("productDemos.noPresentersYet")}</p>
            ) : (
              <p className="text-sm">{assignedPresenters.map((row) => profileLabel(row.userId)).join(" · ")}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">{t("productDemos.weekHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {weekdayOrder.map((weekday) => {
              const isWork = Boolean(activeWindow(windows, weekday));
              const dayHours = hours[weekday] ?? { start: "09:00", end: "17:00" };
              return (
                <div
                  key={weekday}
                  className={`space-y-2 rounded-2xl border p-3 ${
                    isWork
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : "border-border/60 bg-muted/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{t(`productDemos.weekdays.${weekday}`)}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        isWork
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isWork ? t("productDemos.workDay") : t("productDemos.offDay")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`pd-start-${weekday}`}>{t("productDemos.scheduling.start")}</Label>
                      <Input
                        id={`pd-start-${weekday}`}
                        type="time"
                        value={dayHours.start}
                        onChange={(event) =>
                          setHours((current) => ({
                            ...current,
                            [weekday]: { ...dayHours, start: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`pd-end-${weekday}`}>{t("productDemos.scheduling.end")}</Label>
                      <Input
                        id={`pd-end-${weekday}`}
                        type="time"
                        value={dayHours.end}
                        onChange={(event) =>
                          setHours((current) => ({
                            ...current,
                            [weekday]: { ...dayHours, end: event.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={isWork ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => saveWeekday(weekday, true)}
                    >
                      {isWork ? t("productDemos.scheduling.saveHours") : t("productDemos.scheduling.markWork")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || !isWork}
                      onClick={() => saveWeekday(weekday, false)}
                    >
                      {t("productDemos.scheduling.markOff")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 rounded-2xl border border-border/60 p-4">
            <h3 className="text-sm font-semibold">{t("productDemos.scheduling.publishDates")}</h3>
            <p className="text-sm text-muted-foreground">{t("productDemos.scheduling.calendarHelp")}</p>
            <div className="flex items-center justify-between gap-3">
              <Button type="button" size="sm" variant="outline" onClick={() => shiftMonth(-1)}>
                {t("productDemos.scheduling.prevMonth")}
              </Button>
              <p className="text-sm font-semibold">{monthLabel}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => shiftMonth(1)}>
                {t("productDemos.scheduling.nextMonth")}
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-medium text-muted-foreground">
              {weekdayOrder.map((weekday) => (
                <div key={weekday} className="py-1">
                  {t(`productDemos.weekdays.${weekday}`)}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((ymd, index) => {
                if (!ymd) return <div key={`empty-${index}`} className="h-14" />;
                const weekday = weekdayOfYmd(ymd);
                const work = Boolean(activeWindow(windows, weekday));
                const selected = publishDates.includes(ymd);
                const past = ymd < todayYmd;
                const dayNumber = Number(ymd.slice(8));
                return (
                  <button
                    key={ymd}
                    type="button"
                    disabled={past || busy}
                    onClick={() => togglePublishDate(ymd)}
                    className={`flex h-14 flex-col items-center justify-center rounded-xl border text-sm ${
                      past
                        ? "cursor-not-allowed border-transparent text-muted-foreground/40"
                        : selected
                          ? "border-emerald-600 bg-emerald-600 font-semibold text-white"
                          : work
                            ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                            : "border-border/50 bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <span>{dayNumber}</span>
                    <span className="text-[10px] font-medium">
                      {past ? "" : work ? t("productDemos.workDay") : t("productDemos.offDay")}
                    </span>
                  </button>
                );
              })}
            </div>
            {publishDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("productDemos.scheduling.noneSelected")}</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("productDemos.scheduling.selectedSummary", { count: publishDates.length })}
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {publishDates.map((ymd) => {
                    const window = activeWindow(windows, weekdayOfYmd(ymd));
                    return (
                      <li key={ymd}>
                        {formatYmd(ymd, i18n.language)}
                        {window
                          ? ` — ${t("productDemos.scheduling.slotWindow", {
                              start: window.startTime.slice(0, 5),
                              end: window.endTime.slice(0, 5),
                              minutes: selectedOffering?.durationMinutes ?? 30,
                            })}`
                          : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <Button
              type="button"
              disabled={busy || !hasPresenter || !hasWorkDay || publishDates.length === 0}
              onClick={() => {
                setSlotPage(0);
                void run(t("productDemos.scheduling.generated"), async () => {
                  const result = await mutations.generateSlots.mutateAsync({
                    offeringId: selectedOfferingId,
                    dates: publishDates,
                    publish: true,
                  });
                  const created = Number(result.created ?? 0);
                  const published = Number(result.published ?? 0);
                  return t("productDemos.createdCount", { count: created, published });
                });
              }}
            >
              {mutations.generateSlots.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("productDemos.scheduling.publishSelected")
              )}
            </Button>
          </div>
          {!hasPresenter || !hasWorkDay ? (
            <p className="text-xs text-muted-foreground">
              {!hasPresenter
                ? t("productDemos.needPresenter")
                : t("productDemos.scheduling.generateNeedsWorkDay")}
            </p>
          ) : null}
        </DashboardCard>
      ) : null}

      {selectedOfferingId ? (
        <DashboardCard className="space-y-3 p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t("productDemos.scheduling.slots")}</h2>
            <p className="text-sm text-muted-foreground">{t("productDemos.scheduling.slotsPageHint")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pd-slot-day">{t("productDemos.scheduling.filterDay")}</Label>
              <select
                id="pd-slot-day"
                className={selectClass}
                value={slotDay}
                onChange={(event) => {
                  setSlotDay(event.target.value);
                  setSlotPage(0);
                }}
              >
                <option value="">{t("productDemos.scheduling.allDays")}</option>
                {slotsByDay.map(([ymd]) => (
                  <option key={ymd} value={ymd}>
                    {formatYmd(ymd, i18n.language)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pd-slot-status">{t("productDemos.scheduling.filterStatus")}</Label>
              <select
                id="pd-slot-status"
                className={selectClass}
                value={slotStatus}
                onChange={(event) => {
                  setSlotStatus(event.target.value);
                  setSlotPage(0);
                }}
              >
                <option value="">{t("productDemos.bookings.all")}</option>
                {SLOT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(t, status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {slotsQuery.isLoading ? (
            <DashboardTableSkeleton rows={4} />
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {slotStatus || slotDay ? t("productDemos.scheduling.noSlotsFiltered") : t("productDemos.noSlots")}
            </p>
          ) : !currentDay ? (
            <p className="text-sm text-muted-foreground">{t("productDemos.scheduling.noSlotsFiltered")}</p>
          ) : (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold">
                  {t("productDemos.scheduling.dayHeading", {
                    date: formatYmd(currentDay[0], i18n.language),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("productDemos.scheduling.daySlotCount", { count: daySlots.length })}
                </p>
              </div>
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-start text-[13px]">
                  <thead className="border-b border-border/40 bg-muted/20 text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className={thClass}>{t("productDemos.scheduling.columns.start")}</th>
                      <th className={thClass}>{t("productDemos.scheduling.columns.presenter")}</th>
                      <th className={thClass}>{t("productDemos.scheduling.columns.status")}</th>
                      <th className={thClass}>{t("productDemos.scheduling.columns.capacity")}</th>
                      <th className={thClass}>{t("productDemos.scheduling.columns.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daySlots.map((slot) => (
                      <tr key={slot.id} className="border-b border-border/30 last:border-0">
                        <td className={tdClass}>{formatTime(slot.startAt, i18n.language)}</td>
                        <td className={tdClass}>{profileLabel(slot.presenterUserId)}</td>
                        <td className={tdClass}>{statusLabel(t, slot.status)}</td>
                        <td className={`${tdClass} tabular-nums`}>
                          {slot.bookedCount}/{slot.capacity}
                        </td>
                        <td className={tdClass}>
                          {canManage ? (
                            <div className="flex flex-wrap gap-1">
                              {slot.status === "draft" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(t("productDemos.scheduling.slotPublished"), () =>
                                      mutations.publishSlot.mutateAsync(slot.id),
                                    )
                                  }
                                >
                                  {t("productDemos.scheduling.publish")}
                                </Button>
                              ) : null}
                              {slot.status === "published" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(t("productDemos.scheduling.slotUnpublished"), () =>
                                      mutations.unpublishSlot.mutateAsync(slot.id),
                                    )
                                  }
                                >
                                  {t("productDemos.scheduling.unpublish")}
                                </Button>
                              ) : null}
                              {slot.status !== "blocked" && slot.status !== "booked" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(t("productDemos.scheduling.slotBlocked"), () =>
                                      mutations.blockSlot.mutateAsync({ slotId: slot.id }),
                                    )
                                  }
                                >
                                  {t("productDemos.scheduling.block")}
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{t("productDemos.bookings.noAction")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}
          {!slotDay && dayPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {t("productDemos.scheduling.dayPage", { page: dayIndex + 1, pages: dayPages })}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={dayIndex === 0 || slotsQuery.isFetching}
                  onClick={() => setSlotPage(Math.max(0, dayIndex - 1))}
                >
                  {t("pagination.previous")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={dayIndex + 1 >= dayPages || slotsQuery.isFetching}
                  onClick={() => setSlotPage(dayIndex + 1)}
                >
                  {t("pagination.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </DashboardCard>
      ) : null}
    </div>
  );
}
