import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WebsiteChatBubble } from "@/components/website/website-chat-bubble";
import { WebsiteServiceBooking } from "@/components/website/website-service-booking";
import { usePortalProfile } from "@/lib/customer-portal/hooks";
import { orderedPreviewHours, WebsiteVisitorBody } from "@/components/website/website-visitor-body";
import { supabase } from "@/lib/supabase";
import { parsePublicWebsite, parseWebsiteProducts, type PublicWebsite } from "@/lib/website/website-model";
import { loadWebsiteBookingCatalog } from "@/lib/website/website-booking-catalog";

async function loadPublicWebsite(slug: string): Promise<PublicWebsite | null> {
  const { data, error } = await supabase.rpc("website_public_resolve", { p_slug: slug });
  if (error) throw new Error(error.message);
  return parsePublicWebsite(data);
}

export function PublicCompanyWebsitePage() {
  const [, params] = useRoute("/site/:slug");
  const slug = params?.slug ?? "";
  const { t } = useTranslation("common");
  const profile = usePortalProfile(slug);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["public-website", slug],
    enabled: Boolean(slug),
    queryFn: () => loadPublicWebsite(slug),
  });
  const companyId = profile.data?.companyId ?? null;
  const catalog = useQuery({
    queryKey: ["website-booking-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => loadWebsiteBookingCatalog(companyId!),
  });
  const productsQuery = useQuery({
    queryKey: ["public-website-products", slug],
    enabled: Boolean(slug && query.data?.sections.products),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("website_public_products", { p_slug: slug });
      if (error) throw new Error(error.message);
      return parseWebsiteProducts(data);
    },
  });

  if (query.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm">{t("common.loading")}</div>;
  }
  if (!query.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm">
        {t("websiteBuilder.visitor.notFound")}
      </div>
    );
  }

  const site = query.data;
  const apiBaseUrl = String(import.meta.env.VITE_API_SERVER_URL ?? "").trim();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <WebsiteVisitorBody
        model={{
          companyName: site.name,
          logoUrl: site.branding.logoUrl,
          coverImageUrl: site.branding.coverImageUrl || site.coverImageUrl,
          primaryColor: site.branding.primaryColor,
          headline: site.headline,
          description: site.description,
          sections: site.sections,
          services: site.services.map((service) => ({
            id: service.id,
            name: service.name,
            description: service.description,
            durationMinutes: service.durationMinutes,
            priceCents: service.priceCents,
            currency: service.currency,
          })),
          locationLine: [site.location.address, site.location.city].filter(Boolean).join(" · ") || null,
          branchLines: (catalog.data?.branches ?? []).map((branch) => branch.line).filter(Boolean),
          products: productsQuery.data ?? [],
          hours: orderedPreviewHours(site.workingHours),
          gallery: site.gallery,
          content: site.content,
        }}
        onBook={(serviceId) => { setBookingServiceId(serviceId); setBookingOpen(true); }}
        contact={<ContactForm slug={site.slug} />}
      />
      <WebsiteServiceBooking
        companyId={profile.data?.companyId ?? null}
        serviceId={bookingServiceId}
        serviceName={site.services.find((service) => service.id === bookingServiceId)?.name ?? ""}
        services={site.services.map((service) => ({ id: service.id, name: service.name }))}
        open={bookingOpen}
        onOpenChange={(open) => { setBookingOpen(open); if (!open) setBookingServiceId(null); }}
        onServiceChange={setBookingServiceId}
      />
      {site.chat && apiBaseUrl ? (
        <WebsiteChatBubble
          apiBaseUrl={apiBaseUrl}
          publicKey={site.chat.publicKey}
          greeting={site.chat.greeting}
          assistant={site.chat.assistant}
          anchor={site.content.chat.anchor}
          side={site.content.chat.side}
        />
      ) : null}
      {site.chat && !apiBaseUrl ? (
        <div className="fixed bottom-4 inset-inline-end-4 z-40 max-w-sm rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 shadow-sm dark:text-amber-100">
          {t("websiteBuilder.visitor.chatApiMissing")}
        </div>
      ) : null}
    </div>
  );
}

function ContactForm({ slug }: { slug: string }) {
  const { t } = useTranslation("common");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorKey, setErrorKey] = useState("invalid");

  const submit = async () => {
    setState("sending");
    const { error } = await supabase.rpc("website_public_submit_contact", {
      p_slug: slug,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_message: message,
    });
    if (error) {
      const text = error.message;
      setErrorKey(text.includes("rate_limited") ? "rate_limited" : text.includes("unavailable") ? "unavailable" : "invalid");
      setState("error");
      return;
    }
    setState("sent");
  };

  if (state === "sent") {
    return <p className="text-sm">{t("websiteBuilder.visitor.contactSent")}</p>;
  }

  return (
    <section className="max-w-lg space-y-3">
      <div className="space-y-2">
        <Label htmlFor="site-name">{t("websiteBuilder.visitor.name")}</Label>
        <Input id="site-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-email">{t("websiteBuilder.visitor.email")}</Label>
        <Input id="site-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-phone">{t("websiteBuilder.visitor.phone")}</Label>
        <Input id="site-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-message">{t("websiteBuilder.visitor.message")}</Label>
        <Textarea id="site-message" value={message} onChange={(event) => setMessage(event.target.value)} />
      </div>
      {state === "error" ? <p className="text-sm text-destructive">{t(`websiteBuilder.visitor.${errorKey}`)}</p> : null}
      <Button type="button" disabled={state === "sending"} onClick={() => void submit()}>
        {t("websiteBuilder.visitor.sendContact")}
      </Button>
    </section>
  );
}
