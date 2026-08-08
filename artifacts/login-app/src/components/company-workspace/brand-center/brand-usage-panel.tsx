import { Eye, LayoutGrid } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { resolveBrandLogos } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import type {
  BrandPreviewSurface,
  CompanyBrandCenterDocument,
} from "@/lib/company-workspace/brand-center/types";
import { cn } from "@/lib/utils";

export type BrandUsageId =
  | "crm"
  | "operations"
  | "portal"
  | "login"
  | "email"
  | "invoice"
  | "quote"
  | "receipt"
  | "sidebar"
  | "header"
  | "company";

const USAGE_TO_SURFACE: Record<BrandUsageId, BrandPreviewSurface> = {
  crm: "crm",
  operations: "operations",
  portal: "portal",
  login: "login",
  email: "email",
  invoice: "invoice",
  quote: "quotation",
  receipt: "receipt",
  sidebar: "sidebar",
  header: "header",
  company: "company",
};

const USAGE_ITEMS: BrandUsageId[] = [
  "crm",
  "operations",
  "company",
  "sidebar",
  "header",
  "portal",
  "login",
  "email",
  "invoice",
  "quote",
  "receipt",
];

type Props = {
  document: CompanyBrandCenterDocument;
  activeSurface: BrandPreviewSurface;
  onSelect: (surface: BrandPreviewSurface) => void;
  onPreviewAll: () => void;
  className?: string;
};

function fallbackNote(
  id: BrandUsageId,
  usingPrimary: ReturnType<typeof resolveBrandLogos>["usingPrimaryFallback"],
): string | null {
  if (id === "email" && usingPrimary.email) return "usingPrimaryLogo";
  if ((id === "invoice" || id === "quote" || id === "receipt") && usingPrimary.invoice) {
    return "usingPrimaryLogo";
  }
  if (id === "sidebar" && usingPrimary.square) return "usingPrimaryLogo";
  if (id === "login" && usingPrimary.light) return "usingPrimaryLogo";
  return null;
}

export function BrandUsagePanel({
  document,
  activeSurface,
  onSelect,
  onPreviewAll,
  className,
}: Props) {
  const { t } = useTranslation("common");
  const base = "companyWorkspace.brandCenter.usage";
  const resolved = resolveBrandLogos(document.logos);

  return (
    <section
      className={cn(
        "space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t(`${base}.title`)}</h2>
          <p className="text-xs text-muted-foreground">{t(`${base}.subtitle`)}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          onClick={onPreviewAll}
        >
          <LayoutGrid className="size-3.5" />
          {t("companyWorkspace.brandCenter.previewAll.button")}
        </Button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {USAGE_ITEMS.map((id) => {
          const surface = USAGE_TO_SURFACE[id];
          const active = activeSurface === surface;
          const noteKey = fallbackNote(id, resolved.usingPrimaryFallback);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(surface)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-start text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2">
                  <Eye className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium">{t(`${base}.items.${id}`)}</span>
                </span>
                {noteKey ? (
                  <span className="ps-5 text-[11px] text-sky-700 dark:text-sky-400">
                    {t(`companyWorkspace.brandCenter.health.fallbacks.${noteKey}`)}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
