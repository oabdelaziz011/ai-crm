import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BrandAssetUploadCard } from "@/components/company-workspace/brand-center/brand-asset-upload-card";
import { BrandHealthStatusBadge } from "@/components/company-workspace/brand-center/brand-health-status-badge";
import { BRAND_FOCUS } from "@/lib/company-workspace/brand-center/brand-focus";
import type { BrandLogoSlot, CompanyBrandLogos } from "@/lib/company-workspace/brand-center/types";
import { resolveBrandLogos } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string;
  logos: CompanyBrandLogos;
  readOnly?: boolean;
  highlightFocusId?: string | null;
  onSetLogo: (slot: BrandLogoSlot, url: string | null) => void;
};

const ADVANCED_SLOTS: {
  slot: Exclude<BrandLogoSlot, "main" | "favicon">;
  labelKey: string;
  usageKey: keyof ReturnType<typeof resolveBrandLogos>["usingPrimaryFallback"];
  focusId: string;
}[] = [
  { slot: "dark", labelKey: "logoDark", usageKey: "dark", focusId: BRAND_FOCUS.logoDark },
  { slot: "light", labelKey: "logoLight", usageKey: "light", focusId: BRAND_FOCUS.logoLight },
  { slot: "square", labelKey: "logoSquare", usageKey: "square", focusId: BRAND_FOCUS.logoSquare },
  { slot: "invoice", labelKey: "logoInvoice", usageKey: "invoice", focusId: BRAND_FOCUS.logoInvoice },
  { slot: "email", labelKey: "logoEmail", usageKey: "email", focusId: BRAND_FOCUS.logoEmail },
];

const ADVANCED_FOCUS_IDS = new Set(ADVANCED_SLOTS.map((s) => s.focusId));

export function BrandAssetsPanel({
  companyId,
  logos,
  readOnly,
  highlightFocusId,
  onSetLogo,
}: Props) {
  const { t } = useTranslation("common");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const resolved = resolveBrandLogos(logos);
  const base = "companyWorkspace.brandCenter.assets";

  useEffect(() => {
    if (highlightFocusId && ADVANCED_FOCUS_IDS.has(highlightFocusId)) {
      setAdvancedOpen(true);
    }
  }, [highlightFocusId]);

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold">{t(`${base}.title`)}</h2>
        <p className="text-xs text-muted-foreground">{t(`${base}.subtitle`)}</p>
      </div>

      <div
        data-brand-focus={BRAND_FOCUS.logoMain}
        className={cn(
          "space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 transition-shadow",
          highlightFocusId === BRAND_FOCUS.logoMain && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{t("companyWorkspace.brandCenter.logoMain")}</p>
            <p className="text-[11px] font-medium text-primary">
              {t(`${base}.required`)}
            </p>
          </div>
        </div>
        <BrandAssetUploadCard
          companyId={companyId}
          slot="main"
          label={t("companyWorkspace.brandCenter.logoMain")}
          hint={t(`${base}.primaryHint`)}
          url={logos.main}
          readOnly={readOnly}
          onUploaded={(url) => onSetLogo("main", url)}
          onDeleted={() => onSetLogo("main", null)}
        />
        <ul className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
          {(["sidebar", "header", "crm", "operations", "company"] as const).map((key) => (
            <li key={key}>• {t(`${base}.primaryUses.${key}`)}</li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", advancedOpen && "rotate-180")}
        />
        {t(`${base}.advanced`)}
      </button>

      {advancedOpen ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ADVANCED_SLOTS.map(({ slot, labelKey, usageKey, focusId }) => {
            const fallback = resolved.usingPrimaryFallback[usageKey];
            return (
              <div
                key={slot}
                data-brand-focus={focusId}
                className={cn(
                  "space-y-1.5 rounded-xl p-1 transition-shadow",
                  highlightFocusId === focusId &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
              >
                <BrandAssetUploadCard
                  companyId={companyId}
                  slot={slot}
                  label={t(`companyWorkspace.brandCenter.${labelKey}`)}
                  hint={t(`${base}.slotHints.${usageKey}`)}
                  url={logos[slot]}
                  readOnly={readOnly}
                  onUploaded={(url) => onSetLogo(slot, url)}
                  onDeleted={() => onSetLogo(slot, null)}
                />
                {fallback ? (
                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    <BrandHealthStatusBadge status="fallback" className="text-[10px]" />
                    <p className="text-[11px] text-sky-700 dark:text-sky-400">
                      {t(`${base}.usingPrimary`)}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
