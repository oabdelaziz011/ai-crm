import type { ReactNode } from "react";
import { Link } from "wouter";
import {
  Building2,
  Globe,
  ImageIcon,
  Mail,
  MapPin,
  Pencil,
  Phone,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmailIdentityPreview } from "@/components/company-workspace/brand-center/email-identity-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resolveBrandLogos } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import { EMAIL_SETTINGS_IDENTITY_HREF } from "@/lib/email-workspace/email-settings-tabs";
import type {
  CompanyBrandCenterDocument,
  CompanyBrandEmail,
  CompanyContactSnapshot,
  EmailIdentityLayout,
} from "@/lib/company-workspace/brand-center/types";
import { cn } from "@/lib/utils";

type Props = {
  draft: CompanyBrandCenterDocument;
  contact: CompanyContactSnapshot;
  disabled?: boolean;
  highlightFocusId?: string | null;
  onPatchEmail: (patch: Partial<CompanyBrandEmail>) => void;
  onEditCompany: () => void;
};

const LAYOUTS: EmailIdentityLayout[] = ["professional", "modern", "minimal", "executive"];

const SOCIAL_FIELDS: {
  key: keyof CompanyBrandEmail["social"];
  labelKey: string;
  placeholder: string;
}[] = [
  { key: "linkedin", labelKey: "linkedin", placeholder: "https://linkedin.com/company/…" },
  { key: "facebook", labelKey: "facebook", placeholder: "https://facebook.com/…" },
  { key: "instagram", labelKey: "instagram", placeholder: "https://instagram.com/…" },
  { key: "x", labelKey: "x", placeholder: "https://x.com/…" },
  { key: "youtube", labelKey: "youtube", placeholder: "https://youtube.com/…" },
  { key: "tiktok", labelKey: "tiktok", placeholder: "https://tiktok.com/@…" },
];

export function EmailIdentityStudio({
  draft,
  contact,
  disabled,
  highlightFocusId,
  onPatchEmail,
  onEditCompany,
}: Props) {
  const { t } = useTranslation("common");
  const email = draft.email;
  const logos = resolveBrandLogos(draft.logos);
  const emailLogo = logos.email;
  const base = "companyWorkspace.brandCenter.emailStudio";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
      <div className="space-y-4">
        <StudioCard
          title={t("companyWorkspace.brandCenter.emailIdentityMoved.title")}
          description={t("companyWorkspace.brandCenter.emailIdentityMoved.body")}
          dataTestId="brand-center-email-identity-redirect"
        >
          <Button asChild type="button" size="sm" className="mt-1">
            <Link href={EMAIL_SETTINGS_IDENTITY_HREF} data-testid="brand-center-go-email-settings">
              {t("companyWorkspace.brandCenter.emailIdentityMoved.cta")}
            </Link>
          </Button>
        </StudioCard>

        <StudioCard title={t(`${base}.contactTitle`)} description={t(`${base}.contactHint`)}>
          <div className="space-y-2.5 rounded-xl border border-border/50 bg-muted/30 p-3">
            <ContactRow
              icon={<Building2 className="size-3.5" />}
              label={t("companyWorkspace.overview.companyName")}
              value={contact.companyName}
            />
            <ContactRow
              icon={<Phone className="size-3.5" />}
              label={t("companyWorkspace.overview.phone")}
              value={contact.phone}
              ltr
            />
            <ContactRow
              icon={<Mail className="size-3.5" />}
              label={t("companyWorkspace.overview.email")}
              value={contact.email}
              ltr
            />
            <ContactRow
              icon={<Globe className="size-3.5" />}
              label={t("companyWorkspace.overview.website")}
              value={contact.website}
              ltr
            />
            <ContactRow
              icon={<MapPin className="size-3.5" />}
              label={t("companyWorkspace.overview.address")}
              value={contact.address}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 h-9 gap-1.5"
            onClick={onEditCompany}
          >
            <Pencil className="size-3.5" />
            {t(`${base}.editCompany`)}
          </Button>
        </StudioCard>

        <StudioCard
          title={t(`${base}.logoTitle`)}
          description={t(`${base}.logoFromAssets`)}
          focusId="logo-email"
          highlighted={highlightFocusId === "logo-email"}
          dataTestId="brand-center-email-logo-readonly"
        >
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/50 bg-muted/20 p-3">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card">
              {emailLogo ? (
                <img src={emailLogo} alt="" className="max-h-14 max-w-[3.5rem] object-contain" />
              ) : (
                <ImageIcon className="size-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">{t(`${base}.currentEmailLogo`)}</p>
              <p className="text-[11px] text-muted-foreground">
                {draft.logos.email
                  ? t("companyWorkspace.brandCenter.logoEmail")
                  : t("companyWorkspace.brandCenter.assets.usingPrimary")}
              </p>
              <p className="text-[11px] text-muted-foreground">{t(`${base}.logoFallback`)}</p>
            </div>
            <Button asChild type="button" variant="outline" size="sm" className="h-9">
              <Link href={EMAIL_SETTINGS_IDENTITY_HREF} data-testid="brand-center-go-email-logo">
                {t("companyWorkspace.brandCenter.emailIdentityMoved.cta")}
              </Link>
            </Button>
          </div>
        </StudioCard>

        <StudioCard title={t(`${base}.ctaTitle`)} description={t(`${base}.ctaHint`)}>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">{t(`${base}.ctaEnable`)}</p>
              <p className="text-[11px] text-muted-foreground">{t(`${base}.ctaEnableHint`)}</p>
            </div>
            <Switch
              checked={email.ctaEnabled}
              disabled={disabled}
              onCheckedChange={(checked) => onPatchEmail({ ctaEnabled: checked })}
              aria-label={t(`${base}.ctaEnable`)}
            />
          </div>
          {email.ctaEnabled ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label={t(`${base}.ctaText`)}
                value={email.ctaText}
                disabled={disabled}
                placeholder={t(`${base}.ctaTextPlaceholder`)}
                onChange={(v) => onPatchEmail({ ctaText: v })}
              />
              <Field
                label={t(`${base}.ctaUrl`)}
                value={email.ctaUrl}
                disabled={disabled}
                placeholder="https://"
                onChange={(v) => onPatchEmail({ ctaUrl: v })}
                ltr
              />
              <div className="space-y-1.5">
                <Label>{t(`${base}.ctaColor`)}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={email.ctaColor || draft.colors.primary}
                    disabled={disabled}
                    className="h-9 w-14 cursor-pointer p-1"
                    onChange={(e) => onPatchEmail({ ctaColor: e.target.value })}
                  />
                  <Input
                    value={email.ctaColor || draft.colors.primary}
                    disabled={disabled}
                    className="h-9 font-mono text-xs"
                    dir="ltr"
                    onChange={(e) => onPatchEmail({ ctaColor: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </StudioCard>

        <StudioCard title={t(`${base}.socialTitle`)} description={t(`${base}.socialHint`)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={t(`${base}.social.${field.labelKey}`)}
                value={email.social[field.key]}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(v) =>
                  onPatchEmail({
                    social: { ...email.social, [field.key]: v },
                  })
                }
                ltr
              />
            ))}
          </div>
        </StudioCard>

        <StudioCard
          title={t("companyWorkspace.brandCenter.emailFooterMoved.title")}
          description={t("companyWorkspace.brandCenter.emailFooterMoved.body")}
          focusId="email-footer"
          highlighted={highlightFocusId === "email-footer"}
          dataTestId="brand-center-email-footer-redirect"
        >
          <Button asChild type="button" size="sm" className="mt-1">
            <Link href={`${EMAIL_SETTINGS_IDENTITY_HREF}#email-footer`}>
              {t("companyWorkspace.brandCenter.emailFooterMoved.cta")}
            </Link>
          </Button>
        </StudioCard>

        <StudioCard title={t(`${base}.layoutTitle`)} description={t(`${base}.layoutHint`)}>
          <div className="grid gap-2 sm:grid-cols-2">
            {LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                disabled={disabled}
                onClick={() => onPatchEmail({ layout })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-start transition-colors",
                  email.layout === layout
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:bg-muted/40",
                  disabled && "opacity-60",
                )}
              >
                <p className="text-sm font-medium">{t(`${base}.layouts.${layout}`)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t(`${base}.layoutDescriptions.${layout}`)}
                </p>
              </button>
            ))}
          </div>
        </StudioCard>
      </div>

      <EmailIdentityPreview document={draft} contact={contact} />
    </div>
  );
}

function StudioCard({
  title,
  description,
  children,
  focusId,
  highlighted,
  dataTestId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  focusId?: string;
  highlighted?: boolean;
  dataTestId?: string;
}) {
  return (
    <section
      data-brand-focus={focusId}
      data-testid={dataTestId}
      className={cn(
        "space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
        highlighted && "ring-2 ring-primary/40",
      )}
    >
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ContactRow({
  icon,
  label,
  value,
  ltr,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate font-medium" dir={ltr ? "ltr" : undefined}>
          {value?.trim() || "—"}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  ltr,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ltr?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        dir={ltr ? "ltr" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
