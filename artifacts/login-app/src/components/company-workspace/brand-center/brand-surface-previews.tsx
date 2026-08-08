import type { CSSProperties } from "react";
import {
  CalendarDays,
  LayoutDashboard,
  Search,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { EmailIdentityPreview } from "@/components/company-workspace/brand-center/email-identity-preview";
import { resolveBrandLogos } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import type {
  BrandPreviewSurface,
  CompanyBrandCenterDocument,
  CompanyContactSnapshot,
} from "@/lib/company-workspace/brand-center/types";
import { cn } from "@/lib/utils";

type Props = {
  document: CompanyBrandCenterDocument;
  surface: BrandPreviewSurface;
  contact: CompanyContactSnapshot;
};

/** Renders production-shaped UI chrome using live brand tokens — not decorative mock cards. */
export function BrandSurfacePreview({ document, surface, contact }: Props) {
  const { t } = useTranslation("common");
  const { colors, general, documents, email } = document;
  const logos = resolveBrandLogos(document.logos);
  const name = general.companyName || contact.companyName || t("companyWorkspace.title");
  const tokenStyle = {
    ["--brand-primary" as string]: colors.primary,
    ["--brand-secondary" as string]: colors.secondary,
    ["--brand-accent" as string]: colors.accent,
    ["--brand-bg" as string]: colors.background,
    ["--brand-surface" as string]: colors.surface,
  } as CSSProperties;

  if (surface === "email") {
    return <EmailIdentityPreview document={document} contact={contact} embedded />;
  }

  if (surface === "sidebar") {
    return (
      <div className="flex min-h-[260px] overflow-hidden" style={tokenStyle}>
        <aside
          className="flex w-[4.5rem] flex-col border-e border-black/10"
          style={{ background: `linear-gradient(180deg, ${colors.secondary}, ${colors.primary})` }}
        >
          <div className="flex h-14 items-center justify-center border-b border-white/15">
            <CompanyLogo name={name} logoUrl={logos.square} className="h-9 w-9" />
          </div>
          <div className="flex flex-1 flex-col items-center gap-3 py-4 text-white/80">
            <LayoutDashboard className="size-4" />
            <Users className="size-4" />
            <CalendarDays className="size-4" />
          </div>
        </aside>
        <aside
          className="flex w-44 flex-col border-e border-black/10 text-white"
          style={{ background: `linear-gradient(180deg, ${colors.secondary}ee, ${colors.primary}cc)` }}
        >
          <div className="flex h-14 items-center gap-2 border-b border-white/15 px-3">
            <CompanyLogo name={name} logoUrl={logos.dark || logos.primary} className="h-8 w-8" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{name}</p>
              <p className="truncate text-[10px] text-white/70">
                {t("companyWorkspace.brandCenter.surfaces.sidebar")}
              </p>
            </div>
          </div>
          <div className="space-y-1 p-2 text-[11px]">
            <div className="rounded-lg bg-white/15 px-2 py-1.5 font-medium">CRM</div>
            <div className="rounded-lg px-2 py-1.5 text-white/75">Operations</div>
          </div>
        </aside>
        <div className="flex-1 p-3" style={{ backgroundColor: colors.background }}>
          <p className="text-[11px] text-muted-foreground">
            {logos.usingPrimaryFallback.square
              ? t("companyWorkspace.brandCenter.assets.usingPrimary")
              : t("companyWorkspace.brandCenter.assets.slotHints.square")}
          </p>
        </div>
      </div>
    );
  }

  if (surface === "header") {
    return (
      <div style={{ ...tokenStyle, backgroundColor: colors.background }}>
        <header
          className="flex h-14 items-center justify-between gap-3 border-b px-4"
          style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}22` }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <CompanyLogo name={name} logoUrl={logos.primary} className="h-8 w-8" />
            <p className="truncate text-sm font-semibold" style={{ color: colors.secondary }}>
              {name}
            </p>
          </div>
          <div
            className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] text-muted-foreground sm:flex"
            style={{ borderColor: `${colors.primary}33` }}
          >
            <Search className="size-3.5" />
            Search…
          </div>
          <div
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            Live
          </div>
        </header>
      </div>
    );
  }

  if (surface === "company") {
    return (
      <div className="min-h-[200px] p-4" style={{ ...tokenStyle, backgroundColor: colors.background }}>
        <div
          className="rounded-xl border p-4 shadow-sm"
          style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}22` }}
        >
          <CompanyLogo name={name} logoUrl={logos.primary} className="mb-3 h-12 w-12" />
          <p className="text-sm font-semibold" style={{ color: colors.secondary }}>
            {name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {general.description || t("companyWorkspace.brandCenter.surfaces.company")}
          </p>
          <div
            className="mt-3 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            {t("companyWorkspace.brandCenter.surfaces.company")}
          </div>
        </div>
      </div>
    );
  }

  if (surface === "crm" || surface === "operations") {
    const logo = logos.primary;
    const title =
      surface === "crm"
        ? t("companyWorkspace.brandCenter.surfaces.crm")
        : t("companyWorkspace.brandCenter.surfaces.operations");
    return (
      <div className="min-h-[240px]" style={{ ...tokenStyle, backgroundColor: colors.background }}>
        <header
          className="flex h-14 items-center justify-between gap-3 border-b px-4"
          style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}22` }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <CompanyLogo name={name} logoUrl={logo} className="h-8 w-8" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" style={{ color: colors.secondary }}>
                {name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{title}</p>
            </div>
          </div>
          <div
            className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] text-muted-foreground sm:flex"
            style={{ borderColor: `${colors.primary}33` }}
          >
            <Search className="size-3.5" />
            Search…
          </div>
          <div
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            Live
          </div>
        </header>
        <div className="grid gap-2 p-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 shadow-sm"
              style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}18` }}
            >
              <div
                className="mb-2 h-1.5 w-10 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              <p className="text-xs font-semibold" style={{ color: colors.secondary }}>
                {title} {i}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("companyWorkspace.brandCenter.previewCardBody")}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (surface === "login") {
    return (
      <div
        className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6"
        style={{
          ...tokenStyle,
          background: `linear-gradient(145deg, ${colors.primary}22, ${colors.background})`,
        }}
      >
        <div
          className="flex size-14 items-center justify-center rounded-2xl border shadow-lg"
          style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}33` }}
        >
          {logos.light || logos.primary ? (
            <img
              src={(logos.light || logos.primary)!}
              alt=""
              className="max-h-10 max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-lg font-bold" style={{ color: colors.primary }}>
              {name.slice(0, 1)}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold" style={{ color: colors.secondary }}>
          {name}
        </p>
        <div
          className="w-full max-w-[220px] space-y-2 rounded-xl border p-3 shadow-sm"
          style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}22` }}
        >
          <div className="h-8 rounded-md bg-muted/70" />
          <div className="h-8 rounded-md bg-muted/70" />
          <button
            type="button"
            className="w-full rounded-md py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            {t("companyWorkspace.brandCenter.previewSignIn")}
          </button>
        </div>
        {logos.usingPrimaryFallback.light ? (
          <p className="text-[10px] text-muted-foreground">
            {t("companyWorkspace.brandCenter.assets.usingPrimary")}
          </p>
        ) : null}
      </div>
    );
  }

  if (surface === "portal") {
    return (
      <div className="min-h-[240px] p-4" style={{ ...tokenStyle, backgroundColor: colors.background }}>
        <div
          className="rounded-xl p-4 shadow-sm"
          style={{ backgroundColor: colors.surface }}
        >
          <div className="mb-3 flex items-center gap-2">
            <CompanyLogo
              name={name}
              logoUrl={logos.square || logos.primary}
              className="h-10 w-10"
            />
            <p className="text-sm font-semibold" style={{ color: colors.primary }}>
              {name}
            </p>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {general.description || t("companyWorkspace.brandCenter.previewPortalHint")}
          </p>
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: colors.primary }}
          >
            {t("companyWorkspace.brandCenter.previewBook")}
          </button>
        </div>
      </div>
    );
  }

  if (surface === "invoice" || surface === "quotation" || surface === "receipt") {
    const logo = logos.invoice;
    const label =
      surface === "invoice"
        ? t("companyWorkspace.brandCenter.surfaces.invoice")
        : surface === "quotation"
          ? t("companyWorkspace.brandCenter.surfaces.quotation")
          : t("companyWorkspace.brandCenter.surfaces.receipt");
    return (
      <div
        className="space-y-3 p-4"
        style={{ ...tokenStyle, backgroundColor: colors.surface, color: "#111827" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {logo ? (
              <img src={logo} alt="" className="h-10 max-w-[120px] object-contain" />
            ) : (
              <CompanyLogo name={name} logoUrl={null} className="h-10 w-10" />
            )}
            <div>
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-[11px] text-gray-500">
                {label} #1042
              </p>
            </div>
          </div>
          <div
            className="rounded-md px-2 py-1 text-[10px] font-semibold text-white"
            style={{ backgroundColor: colors.accent }}
          >
            {surface === "receipt"
              ? t("companyWorkspace.brandCenter.previewPaid")
              : t("companyWorkspace.brandCenter.previewPaid")}
          </div>
        </div>
        {logos.usingPrimaryFallback.invoice ? (
          <p className="text-[10px] text-gray-500">
            {t("companyWorkspace.brandCenter.assets.usingPrimary")}
          </p>
        ) : null}
        <div className="h-px" style={{ backgroundColor: `${colors.primary}33` }} />
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">{t("companyWorkspace.brandCenter.previewLineItem")}</span>
            <span>250.00</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t("companyWorkspace.brandCenter.previewTotal")}</span>
            <span style={{ color: colors.primary }}>250.00</span>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-gray-500">
          {documents.invoiceFooter ||
            email.legalText ||
            t("companyWorkspace.brandCenter.previewFooterFallback")}
        </p>
      </div>
    );
  }

  // Legacy color playground surfaces — still token-driven, not fake marketing mocks.
  if (surface === "buttons") {
    return (
      <div className="flex flex-wrap gap-2 p-4" style={{ backgroundColor: colors.surface }}>
        {[colors.primary, colors.secondary, colors.accent, colors.success, colors.warning, colors.danger].map(
          (color, i) => (
            <button
              key={i}
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              Token {i + 1}
            </button>
          ),
        )}
      </div>
    );
  }

  return (
    <div className={cn("p-4")} style={{ backgroundColor: colors.background }}>
      <div
        className="rounded-xl border p-4 shadow-sm"
        style={{ backgroundColor: colors.surface, borderColor: `${colors.primary}22` }}
      >
        <CompanyLogo name={name} logoUrl={logos.primary} className="mb-3 h-10 w-10" />
        <p className="text-sm font-semibold" style={{ color: colors.secondary }}>
          {name}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("companyWorkspace.brandCenter.livePreviewHint")}
        </p>
      </div>
    </div>
  );
}
