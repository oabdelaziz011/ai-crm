import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CustomerPhoneInput } from "@/components/customers/customer-phone-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateCustomerPhoneFormInput } from "@/lib/customers/customer-phone-form";
import { invalidateBookingQueries } from "@/lib/booking/invalidate-booking-queries";
import { usePortalResources, usePublicBookingCreate } from "@/lib/customer-portal/hooks";
import { getCustomerPortalServices } from "@/lib/customer-portal/services/customer-portal-service";
import { loadWebsiteBookingCatalog, serviceIdsForBranch } from "@/lib/website/website-booking-catalog";
import { loadWebsiteServicePricing } from "@/lib/website/website-service-pricing";
import { pricingTypeLabel } from "@/lib/scheduling/pricing-type-label";

type Gender = "male" | "female";

function upcomingDates(count: number): string[] {
  const dates: string[] = [];
  const start = new Date();
  for (let offset = 0; offset < count; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    const month = String(day.getMonth() + 1).padStart(2, "0");
    const date = String(day.getDate()).padStart(2, "0");
    dates.push(`${day.getFullYear()}-${month}-${date}`);
  }
  return dates;
}

export function WebsiteServiceBooking({
  companyId,
  serviceId,
  serviceName,
  services = [],
  open,
  onOpenChange,
  onServiceChange,
}: {
  companyId: string | null;
  serviceId: string | null;
  serviceName: string;
  services?: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onServiceChange?: (serviceId: string | null) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneRegion, setPhoneRegion] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | "">("");
  const [pricingRuleId, setPricingRuleId] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resources = usePortalResources(open ? companyId : null, serviceId ?? undefined);
  const catalog = useQuery({
    queryKey: ["website-booking-catalog", companyId],
    enabled: Boolean(open && companyId),
    queryFn: () => loadWebsiteBookingCatalog(companyId!),
  });
  const pricing = useQuery({
    queryKey: ["website-service-pricing", companyId, serviceId],
    enabled: Boolean(open && companyId && serviceId),
    queryFn: () => loadWebsiteServicePricing(companyId!, serviceId!),
  });
  const createBooking = usePublicBookingCreate(null);
  const branches = catalog.data?.branches ?? [];
  const offers = catalog.data?.offers ?? [];
  const needsBranch = branches.length > 0;
  const visibleServices = useMemo(() => {
    if (!branchId) return [];
    const offeredHere = serviceIdsForBranch(offers, branchId);
    return services.filter((service) => offeredHere.has(service.id));
  }, [branchId, offers, services]);
  const visibleResources = useMemo(() => {
    const rows = resources.data ?? [];
    if (!branchId || !serviceId) return [];
    const allowed = new Set(
      offers.filter((offer) => offer.branchId === branchId && offer.serviceId === serviceId).map((offer) => offer.resourceId),
    );
    return rows.filter((row) => allowed.has(row.id));
  }, [branchId, offers, resources.data, serviceId]);
  const selectedRule = (pricing.data ?? []).find((rule) => rule.id === pricingRuleId) ?? null;
  const slots = useQuery({
    queryKey: ["website-booking-slots", companyId, resourceId, serviceId, selectedRule?.durationMinutes ?? null],
    enabled: Boolean(open && companyId && resourceId && serviceId),
    queryFn: async () => {
      const portal = getCustomerPortalServices();
      const days = upcomingDates(14);
      const lists = await Promise.allSettled(
        days.map(async (date) => {
          const rows = await portal.booking.getAvailableSlots(
            companyId!,
            resourceId!,
            serviceId!,
            date,
            selectedRule?.durationMinutes,
          );
          return rows.filter((row) => row.available).map((row) => ({ date, startTime: row.startTime }));
        }),
      );
      const open = lists.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
      if (open.length === 0) {
        const failed = lists.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") {
          throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
        }
      }
      return open;
    },
  });

  useEffect(() => {
    if (!open) return;
    setBranchId(null);
    setDone(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setResourceId(null);
    setPricingRuleId("");
    setDay("");
    setTime("");
  }, [open, serviceId, branchId]);

  useEffect(() => {
    if (!open || !serviceId || pricing.isLoading) return;
    const rules = pricing.data ?? [];
    if (pricingRuleId && rules.some((rule) => rule.id === pricingRuleId)) return;
    const next = rules.find((rule) => rule.isDefault) ?? rules[0];
    setPricingRuleId(next?.id ?? "");
  }, [open, serviceId, pricing.isLoading, pricing.data, pricingRuleId]);

  useEffect(() => {
    if (branches.length === 1 && branchId !== branches[0].id) setBranchId(branches[0].id);
  }, [branches, branchId]);

  useEffect(() => {
    if (!open || !branchId || !serviceId) return;
    if (visibleServices.some((service) => service.id === serviceId)) return;
    onServiceChange?.(visibleServices[0]?.id ?? null);
  }, [open, branchId, serviceId, visibleServices, onServiceChange]);

  useEffect(() => {
    if (visibleResources.length === 1) {
      if (resourceId !== visibleResources[0].id) setResourceId(visibleResources[0].id);
      return;
    }
    if (resourceId && !visibleResources.some((resource) => resource.id === resourceId)) setResourceId(null);
  }, [visibleResources, resourceId]);

  const days = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const row of slots.data ?? []) {
      const list = grouped.get(row.date) ?? [];
      if (!list.includes(row.startTime)) list.push(row.startTime);
      grouped.set(row.date, list);
    }
    return [...grouped.entries()].map(([date, times]) => ({ date, times }));
  }, [slots.data]);
  const times = days.find((option) => option.date === day)?.times ?? [];
  const selected = day && time ? { date: day, startTime: time } : undefined;
  const rules = pricing.data ?? [];
  const phoneCheck = validateCustomerPhoneFormInput({ phone, region: phoneRegion });
  const phoneReady = phoneCheck.code === "ok" && Boolean(phoneCheck.identity?.phone_e164);
  const nameReady = firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const branchReady = !needsBranch || Boolean(branchId);
  const visitReady = rules.length === 0 || Boolean(selectedRule);
  const ready = Boolean(selected && resourceId && nameReady && phoneReady && gender && visitReady && branchReady);

  const confirm = async () => {
    if (!companyId || !serviceId || !resourceId || !selected || !ready || !gender) return;
    setError(null);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const visitLabel = selectedRule
      ? pricingTypeLabel((key) => t(key), { code: selectedRule.code, label: selectedRule.label })
      : "";
    const notes = [
      `${t("websiteBuilder.visitor.gender")}: ${t(`websiteBuilder.visitor.genderValue.${gender}`)}`,
      visitLabel ? `${t("websiteBuilder.visitor.visitType")}: ${visitLabel}` : "",
    ].filter(Boolean).join("\n");
    try {
      await createBooking.mutateAsync({
        companyId,
        serviceId,
        resourceId,
        date: selected.date,
        slotStart: selected.startTime,
        customer: {
          name: fullName,
          phone: phoneCheck.identity?.phone_e164 ?? phone.trim(),
          phoneRegion,
          email: null,
          preferredLanguage: "ar",
        },
        branchId,
        pricingRuleId: selectedRule?.id ?? null,
        visitType: selectedRule?.code ?? null,
        notes,
      });
      queryClient.setQueryData(
        ["website-booking-slots", companyId, resourceId, serviceId],
        (current: { date: string; startTime: string }[] | undefined) =>
          (current ?? []).filter((row) => !(row.date === selected.date && row.startTime === selected.startTime)),
      );
      invalidateBookingQueries(queryClient, { companyId, resourceId, serviceId, date: selected.date });
      setTime("");
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "INVALID_PHONE"
          ? t("websiteBuilder.visitor.invalidPhone")
          : err instanceof Error
            ? err.message
            : t("websiteBuilder.visitor.bookingFailed"),
      );
    }
  };

  const loadingSlots = resources.isLoading || slots.isLoading || slots.isFetching;
  const dayLabel = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "short" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{serviceName || t("websiteBuilder.section.booking")}</DialogTitle>
        </DialogHeader>
        {done ? (
          <p className="text-sm">{t("websiteBuilder.visitor.bookingConfirmed")}</p>
        ) : (
          <div className="space-y-3">
            {branches.length > 0 ? (
              <div className="space-y-1.5">
                <Label>{t("websiteBuilder.visitor.branch")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={branchId ?? ""}
                  onChange={(event) => setBranchId(event.target.value || null)}
                >
                  {branches.length > 1 ? <option value="">{t("websiteBuilder.visitor.chooseBranch")}</option> : null}
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {visibleServices.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("websiteBuilder.visitor.bookingType")}</legend>
                {visibleServices.map((service) => (
                  <label key={service.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="website-booking-type"
                      checked={serviceId === service.id}
                      onChange={() => onServiceChange?.(service.id)}
                    />
                    <span>{service.name}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {needsBranch && !branchId ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.visitor.chooseBranch")}</p> : null}
            {branchId && visibleServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("websiteBuilder.visitor.noBranchServices")}</p>
            ) : null}
            {!serviceId && visibleServices.length > 0 ? <p className="text-sm text-muted-foreground">{t("websiteBuilder.visitor.pickBookingType")}</p> : null}
            {serviceId ? (
              <div className="space-y-1.5">
                <Label>{t("websiteBuilder.visitor.visitType")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                  value={pricingRuleId}
                  disabled={pricing.isLoading}
                  onChange={(event) => {
                    setPricingRuleId(event.target.value);
                    setDay("");
                    setTime("");
                  }}
                >
                  <option value="">
                    {pricing.isLoading
                      ? t("websiteBuilder.visitor.loadingVisitTypes")
                      : t("websiteBuilder.visitor.chooseVisitType")}
                  </option>
                  {rules.map((rule) => {
                    const amount = (rule.priceCents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
                    const label = pricingTypeLabel((key) => t(key), { code: rule.code, label: rule.label });
                    return (
                      <option key={rule.id} value={rule.id}>
                        {label} · {amount} {rule.currency} · {rule.durationMinutes} {t("forms.booking.minutesShort")}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}
            {serviceId ? (
              <div className="space-y-1.5">
                <Label>{t("websiteBuilder.visitor.resource")}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                  value={resourceId ?? ""}
                  disabled={resources.isLoading || visibleResources.length === 0}
                  onChange={(event) => { setResourceId(event.target.value || null); setDay(""); setTime(""); }}
                >
                  {visibleResources.length !== 1 ? (
                    <option value="">
                      {resources.isLoading
                        ? t("websiteBuilder.visitor.loadingResources")
                        : t("websiteBuilder.visitor.chooseResource")}
                    </option>
                  ) : null}
                  {visibleResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>{resource.name}</option>
                  ))}
                </select>
                {!resources.isLoading && visibleResources.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("websiteBuilder.visitor.noResources")}</p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>{t("websiteBuilder.visitor.day")}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={day} disabled={days.length === 0} onChange={(event) => { setDay(event.target.value); setTime(""); }}>
                <option value="">{days.length > 0 ? t("websiteBuilder.visitor.chooseDay") : loadingSlots ? t("websiteBuilder.builder.loading") : t("websiteBuilder.visitor.noSlots")}</option>
                {days.map((option) => (
                  <option key={option.date} value={option.date}>{dayLabel(option.date)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("websiteBuilder.visitor.time")}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50" value={time} disabled={!day || times.length === 0} onChange={(event) => setTime(event.target.value)}>
                <option value="">{day ? t("websiteBuilder.visitor.chooseSlot") : t("websiteBuilder.visitor.day")}</option>
                {times.map((startTime) => (
                  <option key={startTime} value={startTime}>{startTime.slice(0, 5)}</option>
                ))}
              </select>
              {resources.isError ? <p className="text-xs text-destructive">{resources.error instanceof Error ? resources.error.message : t("websiteBuilder.visitor.bookingFailed")}</p> : null}
              {slots.isError ? <p className="text-xs text-destructive">{slots.error instanceof Error ? slots.error.message : t("websiteBuilder.visitor.bookingFailed")}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="website-booking-first">{t("websiteBuilder.visitor.firstName")}</Label>
                <Input id="website-booking-first" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website-booking-last">{t("websiteBuilder.visitor.lastName")}</Label>
                <Input id="website-booking-last" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>
            </div>
            {!nameReady && (firstName || lastName) ? <p className="text-xs text-muted-foreground">{t("websiteBuilder.visitor.nameParts")}</p> : null}
            <div className="space-y-1.5">
              <Label htmlFor="website-booking-phone">{t("websiteBuilder.visitor.phone")} *</Label>
              <CustomerPhoneInput
                id="website-booking-phone"
                phone={phone}
                region={phoneRegion}
                onPhoneChange={setPhone}
                onRegionChange={setPhoneRegion}
              />
              {phone.trim() && !phoneReady ? (
                <p className="text-xs text-destructive">
                  {phoneCheck.code === "phone_region_required"
                    ? t("forms.customer.phoneRegionRequired")
                    : t("websiteBuilder.visitor.invalidPhone")}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>{t("websiteBuilder.visitor.gender")}</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={gender} onChange={(event) => setGender(event.target.value === "female" ? "female" : event.target.value === "male" ? "male" : "")}>
                <option value="">{t("websiteBuilder.visitor.gender")}</option>
                <option value="male">{t("websiteBuilder.visitor.genderValue.male")}</option>
                <option value="female">{t("websiteBuilder.visitor.genderValue.female")}</option>
              </select>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="button" disabled={!ready || createBooking.isPending} onClick={() => void confirm()}>
              {t("websiteBuilder.visitor.confirmBooking")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
