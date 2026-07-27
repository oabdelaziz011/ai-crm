import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePortalProfile,
  usePortalResources,
  usePortalServices,
  usePortalSlots,
  usePublicBookingCreate,
} from "@/lib/customer-portal/hooks";
import type { PortalBookingStep } from "@/lib/customer-portal/types";
import { PortalProvider } from "@/lib/customer-portal/context/portal-context";
import { portalBrandingStyle } from "@/lib/customer-portal/utilities/portal-branding";
import { useAuth } from "@/context/auth-context";

const STEPS: PortalBookingStep[] = ["service", "doctor", "date", "time", "customer", "review", "confirm"];

type PublicBookingFlowPageProps = Record<string, never>;

export function PublicBookingFlowPage(_props: PublicBookingFlowPageProps) {
  const [, params] = useRoute("/book/:slug/flow");
  const slug = params?.slug ?? "";
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const { data: profile } = usePortalProfile(slug);
  const companyId = profile?.companyId ?? null;

  const [stepIndex, setStepIndex] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const { data: services = [] } = usePortalServices(companyId);
  const { data: resources = [] } = usePortalResources(companyId, serviceId ?? undefined);
  const { data: slots = [] } = usePortalSlots(companyId, resourceId, serviceId, date || null);
  const createBooking = usePublicBookingCreate(user?.id ?? null);

  const step = STEPS[stepIndex] ?? "service";
  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const selectedResource = useMemo(() => resources.find((r) => r.id === resourceId), [resources, resourceId]);

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center">{t("customerPortal.notFound")}</div>;
  }

  const next = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const confirm = async () => {
    if (!companyId || !serviceId || !resourceId || !date || !slotStart) return;
    try {
      await createBooking.mutateAsync({
        companyId,
        serviceId,
        resourceId,
        date,
        slotStart,
        customer: { name, phone, email: email || null },
      });
      toast.success(t("customerPortal.bookingConfirmed"));
      setStepIndex(STEPS.length - 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("customerPortal.bookingFailed"));
    }
  };

  return (
    <PortalProvider slug={slug} profile={profile}>
      <div className="min-h-screen bg-background p-6" style={portalBrandingStyle(profile.branding)}>
        <div className="mx-auto max-w-lg space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{t("customerPortal.bookAppointment")}</h1>
            <Link href={`/book/${slug}`}>
              <Button variant="ghost" size="sm">{t("buttons.back")}</Button>
            </Link>
          </div>

          <div className="text-sm text-muted-foreground" aria-live="polite">
            {t("customerPortal.step")} {stepIndex + 1} / {STEPS.length}: {t(`customerPortal.steps.${step}`)}
          </div>

          {step === "service" ? (
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.id}>
                  <Button
                    variant={serviceId === s.id ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setServiceId(s.id)}
                  >
                    {s.name} · {s.durationMinutes}m
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {step === "doctor" ? (
            <ul className="space-y-2">
              {resources.map((r) => (
                <li key={r.id}>
                  <Button
                    variant={resourceId === r.id ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setResourceId(r.id)}
                  >
                    {r.name}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {step === "date" ? (
            <div>
              <Label htmlFor="booking-date">{t("customerPortal.selectDate")}</Label>
              <Input
                id="booking-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2"
              />
            </div>
          ) : null}

          {step === "time" ? (
            <ul className="grid grid-cols-3 gap-2">
              {slots.map((slot) => (
                <li key={slot.startTime}>
                  <Button
                    variant={slotStart === slot.startTime ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSlotStart(slot.startTime)}
                  >
                    {slot.startTime}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          {step === "customer" ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="cust-name">{t("customerPortal.fullName")}</Label>
                <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cust-phone">{t("customerPortal.phone")}</Label>
                <Input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cust-email">{t("customerPortal.email")}</Label>
                <Input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="rounded-xl border border-white/10 p-4 text-sm space-y-2">
              <div>{selectedService?.name}</div>
              <div>{selectedResource?.name}</div>
              <div>{date} {slotStart}</div>
              <div>{name} · {phone}</div>
            </div>
          ) : null}

          {step === "confirm" && createBooking.isSuccess ? (
            <p className="text-center text-lg font-medium text-emerald-400">{t("customerPortal.bookingConfirmed")}</p>
          ) : null}

          <div className="flex gap-2">
            {stepIndex > 0 && step !== "confirm" ? (
              <Button variant="outline" onClick={back}>{t("buttons.back")}</Button>
            ) : null}
            {step === "review" ? (
              <Button onClick={() => void confirm()} disabled={createBooking.isPending}>
                {t("customerPortal.confirmBooking")}
              </Button>
            ) : step !== "confirm" ? (
              <Button onClick={next} disabled={
                (step === "service" && !serviceId) ||
                (step === "doctor" && !resourceId) ||
                (step === "date" && !date) ||
                (step === "time" && !slotStart) ||
                (step === "customer" && (!name || !phone))
              }>
                {t("buttons.next")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </PortalProvider>
  );
}
