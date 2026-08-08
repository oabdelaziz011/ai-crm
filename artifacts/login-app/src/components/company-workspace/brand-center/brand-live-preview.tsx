import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { BrandSurfacePreview } from "@/components/company-workspace/brand-center/brand-surface-previews";
import { Button } from "@/components/ui/button";
import {
  computeBrandHealth,
  type BrandHealthTarget,
} from "@/lib/company-workspace/brand-center/brand-health";
import { resolveBrandLogos } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import { cn } from "@/lib/utils";
import type {
  BrandPreviewSurface,
  CompanyBrandCenterDocument,
  CompanyContactSnapshot,
} from "@/lib/company-workspace/brand-center/types";

type BrandLivePreviewProps = {
  document: CompanyBrandCenterDocument;
  surface: BrandPreviewSurface;
  onSurfaceChange: (surface: BrandPreviewSurface) => void;
  onNavigateHealth?: (target: BrandHealthTarget) => void;
  companyContact?: CompanyContactSnapshot;
};

const SURFACES: BrandPreviewSurface[] = [
  "sidebar",
  "header",
  "crm",
  "operations",
  "company",
  "login",
  "portal",
  "email",
  "invoice",
  "quotation",
  "receipt",
];

export function BrandLivePreview({
  document,
  surface,
  onSurfaceChange,
  onNavigateHealth,
  companyContact,
}: BrandLivePreviewProps) {
  const { t } = useTranslation("common");
  const { colors, general } = document;
  const contact: CompanyContactSnapshot = companyContact ?? {
    companyName: general.companyName || null,
    phone: general.supportPhone || null,
    email: general.supportEmail || null,
    website: general.website || null,
    address: null,
  };
  const logos = resolveBrandLogos(document.logos);
  const health = computeBrandHealth(document);
  const guidanceKeys = pickGuidance(surface, logos, health.items);
  const guidance = guidanceKeys
    ? {
        message: t(guidanceKeys.messageKey),
        cta: t(guidanceKeys.ctaKey),
        target: guidanceKeys.target,
      }
    : null;

  const shellStyle = {
    ["--brand-primary" as string]: colors.primary,
    ["--brand-secondary" as string]: colors.secondary,
  } as CSSProperties;

  return (
    <aside
      className="sticky top-20 space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm lg:top-24"
      style={shellStyle}
    >
      <div>
        <h2 className="text-sm font-semibold">{t("companyWorkspace.brandCenter.livePreview")}</h2>
        <p className="text-xs text-muted-foreground">
          {t("companyWorkspace.brandCenter.livePreviewHint")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SURFACES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onSurfaceChange(id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              surface === id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {t(`companyWorkspace.brandCenter.surfaces.${id}`)}
          </button>
        ))}
      </div>

      {guidance && onNavigateHealth ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5">
          <p className="text-xs text-foreground">{guidance.message}</p>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto px-0 py-1 text-xs text-primary"
            onClick={() => onNavigateHealth(guidance.target)}
          >
            {guidance.cta}
          </Button>
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-xl border border-border/50"
        style={{ backgroundColor: colors.background }}
      >
        <BrandSurfacePreview document={document} surface={surface} contact={contact} />
      </div>
    </aside>
  );
}

function pickGuidance(
  surface: BrandPreviewSurface,
  logos: ReturnType<typeof resolveBrandLogos>,
  items: ReturnType<typeof computeBrandHealth>["items"],
): { messageKey: string; ctaKey: string; target: BrandHealthTarget } | null {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  if (!logos.primary && (surface === "sidebar" || surface === "crm" || surface === "header" || surface === "company")) {
    const item = byId.primaryLogo;
    if (item) {
      return {
        messageKey: "companyWorkspace.brandCenter.emptyStates.primaryLogo",
        ctaKey: "companyWorkspace.brandCenter.emptyStates.addNow",
        target: item.target,
      };
    }
  }

  if (surface === "email") {
    const footer = byId.emailFooter;
    if (footer && footer.status !== "ready") {
      return {
        messageKey: "companyWorkspace.brandCenter.emptyStates.emailFooter",
        ctaKey: "companyWorkspace.brandCenter.emptyStates.openEmail",
        target: footer.target,
      };
    }
    const sender = byId.senderIdentity;
    if (sender && sender.status !== "ready") {
      return {
        messageKey: "companyWorkspace.brandCenter.emptyStates.senderIdentity",
        ctaKey: "companyWorkspace.brandCenter.emptyStates.openEmail",
        target: sender.target,
      };
    }
  }

  if ((surface === "invoice" || surface === "quotation" || surface === "receipt") && logos.usingPrimaryFallback.invoice) {
    const item = byId.invoiceLogo;
    if (item) {
      return {
        messageKey: "companyWorkspace.brandCenter.emptyStates.invoiceLogoFallback",
        ctaKey: "companyWorkspace.brandCenter.emptyStates.addNow",
        target: item.target,
      };
    }
  }

  return null;
}
