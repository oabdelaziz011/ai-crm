import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { Calendar, MapPin, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalProfile, usePortalResources, usePortalServices } from "@/lib/customer-portal/hooks";
import { PortalProvider } from "@/lib/customer-portal/context/portal-context";
import { portalBrandingStyle } from "@/lib/customer-portal/utilities/portal-branding";

type PublicBookingLandingPageProps = Record<string, never>;

export function PublicBookingLandingPage(_props: PublicBookingLandingPageProps) {
  const [, params] = useRoute("/book/:slug");
  const slug = params?.slug ?? "";
  const { t } = useTranslation("common");
  const { data: profile, isLoading } = usePortalProfile(slug);
  const { data: services = [] } = usePortalServices(profile?.companyId ?? null);
  const { data: doctors = [] } = usePortalResources(profile?.companyId ?? null);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">{t("common.loading")}</div>;
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p>{t("customerPortal.notFound")}</p>
      </div>
    );
  }

  return (
    <PortalProvider slug={slug} profile={profile}>
      <div
        className="min-h-screen bg-background text-foreground"
        style={portalBrandingStyle(profile.branding)}
      >
        <header className="border-b border-white/10 bg-[var(--portal-primary)]/10">
          <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-6">
            {profile.branding.logoUrl ? (
              <img src={profile.branding.logoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : null}
            <div>
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              {profile.description ? (
                <p className="text-sm text-muted-foreground">{profile.description}</p>
              ) : null}
            </div>
          </div>
        </header>

        {profile.branding.coverImageUrl ? (
          <div
            className="h-48 bg-cover bg-center"
            style={{ backgroundImage: `url(${profile.branding.coverImageUrl})` }}
            role="img"
            aria-label={profile.name}
          />
        ) : null}

        <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
          <section className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {profile.location.address ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden /> {profile.location.address}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" aria-hidden /> {t("customerPortal.workingHours")}
            </span>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-semibold">{t("customerPortal.services")}</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {services.map((service) => (
                <li key={service.id} className="rounded-xl border border-white/10 p-4">
                  <div className="font-medium">{service.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {service.durationMinutes} {t("scheduling.operations.minutes")} ·{" "}
                    {service.priceCents > 0 ? `$${(service.priceCents / 100).toFixed(2)}` : t("customerPortal.contactForPrice")}
                  </div>
                  {service.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">{service.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {doctors.length > 0 ? (
            <section>
              <h2 className="mb-4 text-xl font-semibold">{t("customerPortal.doctors")}</h2>
              <ul className="grid gap-3 md:grid-cols-3">
                {doctors.slice(0, 6).map((doc) => (
                  <li key={doc.id} className="rounded-xl border border-white/10 p-4">
                    <div className="font-medium">{doc.name}</div>
                    {doc.specialty ? (
                      <div className="text-sm text-muted-foreground">{doc.specialty}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Link href={`/book/${slug}/flow`}>
              <Button size="lg" className="gap-2 bg-[var(--portal-primary)]">
                <Calendar className="h-4 w-4" aria-hidden />
                {t("customerPortal.bookNow")}
              </Button>
            </Link>
            <Link href={`/portal/${slug}/login`}>
              <Button size="lg" variant="outline">
                {t("customerPortal.myPortal")}
              </Button>
            </Link>
          </div>
        </main>
      </div>
    </PortalProvider>
  );
}
