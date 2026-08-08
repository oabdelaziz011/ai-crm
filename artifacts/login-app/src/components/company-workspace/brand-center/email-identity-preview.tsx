import {
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Youtube,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { resolveEmailLogoUrl } from "@/lib/company-workspace/brand-center/normalize";
import { sanitizeEmailHtml } from "@/lib/company-workspace/brand-center/sanitize-email-html";
import type {
  CompanyBrandCenterDocument,
  CompanyContactSnapshot,
  EmailIdentityLayout,
} from "@/lib/company-workspace/brand-center/types";
import { cn } from "@/lib/utils";

type Props = {
  document: CompanyBrandCenterDocument;
  contact: CompanyContactSnapshot;
  className?: string;
  /** When true, render only the email mock (no sticky chrome / title). */
  embedded?: boolean;
};

function layoutClasses(layout: EmailIdentityLayout) {
  switch (layout) {
    case "modern":
      return {
        shell: "rounded-2xl shadow-md",
        body: "px-5 py-5",
        divider: "border-dashed",
        greeting: "text-base font-semibold tracking-tight",
      };
    case "minimal":
      return {
        shell: "rounded-lg border-border/30 shadow-none",
        body: "px-4 py-4",
        divider: "border-border/30",
        greeting: "text-sm font-medium",
      };
    case "executive":
      return {
        shell: "rounded-none border-s-4 shadow-sm",
        body: "px-6 py-6",
        divider: "border-border/60",
        greeting: "text-sm font-semibold uppercase tracking-[0.08em]",
      };
    default:
      return {
        shell: "rounded-xl shadow-sm",
        body: "px-5 py-5",
        divider: "border-border/50",
        greeting: "text-sm font-semibold",
      };
  }
}

export function EmailIdentityPreview({
  document,
  contact,
  className,
  embedded = false,
}: Props) {
  const { t } = useTranslation("common");
  const { email, logos, colors } = document;
  const layout = layoutClasses(email.layout);
  const logoUrl = resolveEmailLogoUrl(logos);
  const replyTo = email.replyEmail.trim() || contact.email || "";
  const senderLabel =
    email.senderDisplayName.trim() ||
    email.senderName.trim() ||
    contact.companyName ||
    t("companyWorkspace.title");
  const teamLabel = email.senderName.trim() || senderLabel;
  const ctaColor = email.ctaColor || colors.primary;
  const signatureHtml = sanitizeEmailHtml(email.signature);

  const social = [
    { key: "linkedin", url: email.social.linkedin, icon: Linkedin, label: "LinkedIn" },
    { key: "facebook", url: email.social.facebook, icon: Facebook, label: "Facebook" },
    { key: "instagram", url: email.social.instagram, icon: Instagram, label: "Instagram" },
    { key: "x", url: email.social.x, icon: null, label: "X" },
    { key: "youtube", url: email.social.youtube, icon: Youtube, label: "YouTube" },
    { key: "tiktok", url: email.social.tiktok, icon: null, label: "TikTok" },
  ].filter((item) => item.url.trim());

  const mock = (
      <div
        className={cn(
          "overflow-hidden border border-border/50 bg-muted/30 p-3 dark:bg-muted/20",
          email.layout === "executive" && "border-s-0",
          embedded && "border-0 p-0",
        )}
        style={{ backgroundColor: colors.background }}
      >
        <div
          className={cn("overflow-hidden border border-border/40", layout.shell)}
          style={{
            backgroundColor: colors.surface,
            borderInlineStartColor:
              email.layout === "executive" ? colors.primary : undefined,
          }}
        >
          <div className={cn("space-y-4 text-[13px] text-foreground", layout.body)}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-9 max-w-[140px] object-contain" />
            ) : (
              <div
                className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-bold text-white"
                style={{ backgroundColor: colors.primary }}
              >
                {(contact.companyName || "V").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="space-y-2">
              <p className={layout.greeting}>
                {t("companyWorkspace.brandCenter.emailStudio.previewGreeting")}
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {t("companyWorkspace.brandCenter.emailStudio.previewBody")}
              </p>
              <p className="leading-relaxed text-muted-foreground">
                {t("companyWorkspace.brandCenter.emailStudio.previewBody2")}
              </p>
            </div>

            {email.ctaEnabled && email.ctaText.trim() ? (
              <div>
                <a
                  href={email.ctaUrl.trim() || "#"}
                  className="inline-flex rounded-lg px-4 py-2 text-xs font-semibold text-white no-underline"
                  style={{ backgroundColor: ctaColor }}
                  onClick={(e) => e.preventDefault()}
                >
                  {email.ctaText.trim()}
                </a>
              </div>
            ) : null}

            {signatureHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-[12px] text-muted-foreground [&_a]:text-primary"
                dangerouslySetInnerHTML={{ __html: signatureHtml }}
              />
            ) : null}

            <div className={cn("border-t pt-3", layout.divider)}>
              <p className="text-sm font-semibold" style={{ color: colors.secondary }}>
                {teamLabel}
              </p>
              {email.senderDisplayName.trim() &&
              email.senderDisplayName.trim() !== teamLabel ? (
                <p className="text-[11px] text-muted-foreground">{email.senderDisplayName}</p>
              ) : null}
              <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                {contact.phone ? (
                  <p className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="size-3 shrink-0" />
                    {contact.phone}
                  </p>
                ) : null}
                {contact.email ? (
                  <p className="flex items-center gap-1.5" dir="ltr">
                    <Mail className="size-3 shrink-0" />
                    {contact.email}
                  </p>
                ) : null}
                {contact.website ? (
                  <p className="flex items-center gap-1.5" dir="ltr">
                    <Globe className="size-3 shrink-0" />
                    {contact.website}
                  </p>
                ) : null}
                {contact.address ? (
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3 shrink-0" />
                    <span>{contact.address}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {social.length > 0 ? (
              <div className={cn("flex flex-wrap gap-2 border-t pt-3", layout.divider)}>
                {social.map((item) => {
                  const Icon = item.icon;
                  return (
                    <span
                      key={item.key}
                      className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground"
                    >
                      {Icon ? <Icon className="size-3" /> : null}
                      {item.label}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {email.showLegalFooter && email.legalText.trim() ? (
              <div
                className={cn(
                  "border-t pt-3 text-[10px] leading-relaxed text-muted-foreground",
                  layout.divider,
                )}
              >
                {email.legalText}
              </div>
            ) : null}
          </div>
        </div>
      </div>
  );

  if (embedded) {
    return <div className={className}>{mock}</div>;
  }

  return (
    <aside
      className={cn(
        "sticky top-20 space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm lg:top-24",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold">
          {t("companyWorkspace.brandCenter.emailStudio.livePreview")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("companyWorkspace.brandCenter.emailStudio.livePreviewHint")}
        </p>
        {replyTo ? (
          <p className="mt-1 text-[11px] text-muted-foreground" dir="ltr">
            {t("companyWorkspace.brandCenter.emailStudio.replyToPreview", { email: replyTo })}
          </p>
        ) : null}
      </div>
      {mock}
    </aside>
  );
}
