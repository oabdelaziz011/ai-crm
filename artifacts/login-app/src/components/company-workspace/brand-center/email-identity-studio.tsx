import type { ReactNode } from "react";
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
import { EmailSignatureEditor } from "@/components/company-workspace/brand-center/email-signature-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { resolveBrandLogos } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
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
  onChangeLogo: () => void;
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
  onChangeLogo,
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
        {/* Section 1 — Company contact (read-only) */}
        <StudioCard
          title={t(`${base}.contactTitle`)}
          description={t(`${base}.contactHint`)}
        >
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

        {/* Section 2 — Sender identity */}
        <StudioCard
          title={t(`${base}.senderTitle`)}
          description={t(`${base}.senderHint`)}
          focusId="email-sender"
          highlighted={highlightFocusId === "email-sender"}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t(`${base}.senderName`)}
              value={email.senderName}
              disabled={disabled}
              placeholder={t(`${base}.senderNamePlaceholder`)}
              onChange={(v) => onPatchEmail({ senderName: v, header: v })}
            />
            <Field
              label={t(`${base}.senderDisplayName`)}
              value={email.senderDisplayName}
              disabled={disabled}
              placeholder={t(`${base}.senderDisplayPlaceholder`)}
              onChange={(v) => onPatchEmail({ senderDisplayName: v })}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            <Label>{t("companyWorkspace.brandCenter.replyEmail")}</Label>
            <Input
              type="email"
              value={email.replyEmail}
              disabled={disabled}
              placeholder={contact.email || t(`${base}.replyFallbackHint`)}
              onChange={(e) => onPatchEmail({ replyEmail: e.target.value })}
              dir="ltr"
            />
            <p className="text-[11px] text-muted-foreground">{t(`${base}.replyFallbackHint`)}</p>
          </div>
        </StudioCard>

        {/* Section 3 — Email logo (read from Brand Assets — no duplicate upload) */}
        <StudioCard title={t(`${base}.logoTitle`)} description={t(`${base}.logoFromAssets`)}>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={onChangeLogo}
            >
              <ImageIcon className="size-3.5" />
              {t(`${base}.changeLogo`)}
            </Button>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="font-medium text-foreground">{t(`${base}.senderName`)}:</span>{" "}
              {email.senderName.trim() || "—"}
            </p>
            <p>
              <span className="font-medium text-foreground">{t(`${base}.legalTitle`)}:</span>{" "}
              {email.showLegalFooter && email.legalText.trim() ? t(`${base}.showLegal`) : "—"}
            </p>
            <p>
              <span className="font-medium text-foreground">{t(`${base}.ctaTitle`)}:</span>{" "}
              {email.ctaEnabled ? email.ctaText || t(`${base}.ctaEnable`) : "—"}
            </p>
            <p>
              <span className="font-medium text-foreground">{t(`${base}.socialTitle`)}:</span>{" "}
              {Object.values(email.social).filter((v) => v.trim()).length || "—"}
            </p>
          </div>
        </StudioCard>

        {/* Section 4 — CTA */}
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

        {/* Section 5 — Signature */}
        <StudioCard
          title={t("companyWorkspace.brandCenter.emailSignature")}
          description={t(`${base}.signatureHint`)}
        >
          <EmailSignatureEditor
            value={email.signature}
            disabled={disabled}
            onChange={(html) => onPatchEmail({ signature: html })}
          />
        </StudioCard>

        {/* Section 6 — Social */}
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

        {/* Section 7 — Legal footer */}
        <StudioCard
          title={t(`${base}.legalTitle`)}
          description={t(`${base}.legalHint`)}
          focusId="email-footer"
          highlighted={highlightFocusId === "email-footer"}
        >
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
            <p className="text-sm font-medium">{t(`${base}.showLegal`)}</p>
            <Switch
              checked={email.showLegalFooter}
              disabled={disabled}
              onCheckedChange={(checked) => onPatchEmail({ showLegalFooter: checked })}
              aria-label={t(`${base}.showLegal`)}
            />
          </div>
          {email.showLegalFooter ? (
            <div className="mt-3 space-y-1.5">
              <Label>{t(`${base}.legalText`)}</Label>
              <Textarea
                value={email.legalText}
                disabled={disabled}
                rows={3}
                placeholder={t(`${base}.legalPlaceholder`)}
                onChange={(e) =>
                  onPatchEmail({ legalText: e.target.value, footer: e.target.value })
                }
              />
            </div>
          ) : null}
        </StudioCard>

        {/* Section 8 — Layout */}
        <StudioCard title={t(`${base}.layoutTitle`)} description={t(`${base}.layoutHint`)}>
          <div
            className="grid gap-2 sm:grid-cols-2"
            role="radiogroup"
            aria-label={t(`${base}.layoutTitle`)}
          >
            {LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                role="radio"
                aria-checked={email.layout === layout}
                disabled={disabled}
                onClick={() => onPatchEmail({ layout })}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-start transition-colors",
                  email.layout === layout
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/60 bg-card text-muted-foreground hover:border-border hover:bg-muted/40",
                  disabled && "pointer-events-none opacity-60",
                )}
              >
                <p className="text-sm font-semibold">
                  {t(`${base}.layouts.${layout}`)}
                </p>
                <p className="mt-0.5 text-[11px]">
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
}: {
  title: string;
  description?: string;
  children: ReactNode;
  focusId?: string;
  highlighted?: boolean;
}) {
  return (
    <section
      data-brand-focus={focusId}
      className={cn(
        "space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-shadow",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
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
  if (!value?.trim()) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-foreground" dir={ltr ? "ltr" : undefined}>
          {value}
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
