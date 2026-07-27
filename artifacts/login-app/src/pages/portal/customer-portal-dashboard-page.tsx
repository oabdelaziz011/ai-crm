import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  usePortalAppointments,
  usePortalCancelAppointment,
  usePortalProfile,
} from "@/lib/customer-portal/hooks";
import { portalAppointmentsKey } from "@/lib/customer-portal/cache/query-keys";
import { getPortalSession } from "@/lib/customer-portal/security/portal-session-store";
import { portalBrandingStyle } from "@/lib/customer-portal/utilities/portal-branding";

type CustomerPortalDashboardPageProps = Record<string, never>;

export function CustomerPortalDashboardPage(_props: CustomerPortalDashboardPageProps) {
  const [, params] = useRoute("/portal/:slug");
  const slug = params?.slug ?? "";
  const { t } = useTranslation("common");
  const session = getPortalSession();
  const { data: profile } = usePortalProfile(slug);
  const companyId = profile?.companyId ?? null;
  const customerId = session?.customerId ?? null;
  const { data: upcoming = [] } = usePortalAppointments(companyId, customerId, "upcoming");
  const cancelAppointment = usePortalCancelAppointment(companyId);
  const queryClient = useQueryClient();

  const handleCancel = (bookingId: string) => {
    if (!companyId || !customerId) return;
    cancelAppointment.mutate(bookingId, {
      onSuccess: () => {
        toast.success(t("customerPortal.cancelSuccess"));
        void queryClient.invalidateQueries({
          queryKey: portalAppointmentsKey(companyId, customerId, "upcoming"),
        });
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : t("customerPortal.cancelFailed"));
      },
    });
  };

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p>{t("customerPortal.loginRequired")}</p>
        <Link href={`/portal/${slug}/login`}>
          <Button>{t("customerPortal.loginTitle")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6" style={profile ? portalBrandingStyle(profile.branding) : undefined}>
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("customerPortal.dashboard")}</h1>
          <Link href={`/book/${slug}/flow`}>
            <Button>{t("customerPortal.bookAgain")}</Button>
          </Link>
        </header>

        <section className="rounded-xl border border-white/10 p-5">
          <h2 className="mb-4 font-semibold">{t("customerPortal.upcomingAppointments")}</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("customerPortal.noAppointments")}</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((appt) => (
                <li key={appt.id} className="rounded-lg border border-white/10 p-3 text-sm">
                  <div className="font-medium">{appt.serviceName}</div>
                  <div className="text-muted-foreground">{appt.resourceName}</div>
                  <div>{new Date(appt.startAt).toLocaleString()}</div>
                  <div className="mt-2 flex gap-2">
                    {appt.canCancel ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelAppointment.isPending}
                        onClick={() => handleCancel(appt.id)}
                      >
                        {t("customerPortal.cancel")}
                      </Button>
                    ) : null}
                    {appt.canReschedule ? (
                      <Link href={`/book/${slug}/flow`}>
                        <Button size="sm" variant="outline">{t("customerPortal.reschedule")}</Button>
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 p-4">
            <h3 className="font-medium">{t("customerPortal.invoices")}</h3>
            <p className="text-sm text-muted-foreground">{t("customerPortal.invoicesHint")}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-4">
            <h3 className="font-medium">{t("customerPortal.payments")}</h3>
            <p className="text-sm text-muted-foreground">{t("customerPortal.paymentsHint")}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-4">
            <h3 className="font-medium">{t("customerPortal.documents")}</h3>
            <p className="text-sm text-muted-foreground">{t("customerPortal.documentsHint")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
