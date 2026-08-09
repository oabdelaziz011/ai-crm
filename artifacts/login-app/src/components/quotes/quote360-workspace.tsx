import {
  ArrowLeft,
  FileText,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { QuoteLineItemReadModel, QuoteReadModel } from "@workspace/application-layer";
import { CompanyLogo } from "@/components/billing/identity/company-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { ENTITY_360_DIALOG_CONTENT_CLASS } from "@/components/entity-workspace/entity-360-dialog-shell";
import { useAuth } from "@/context/auth-context";
import { useResolvedCompanyLogos } from "@/hooks/company-workspace/use-company-brand-logos";
import { useCompanyIdentity } from "@/hooks/company-workspace/use-company-identity";
import { useProductCatalog, useProductCommands } from "@/hooks/products/use-product-commands";
import {
  useOpportunityQuotes,
  useQuote360,
  useQuoteCommands,
} from "@/hooks/quotes/use-quote-commands";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import { formatBillingCurrency } from "@/lib/billing/format";
import { pickChromeLogo } from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import { SUPPORTED_APP_LANGUAGES, type AppLanguage } from "@/lib/i18n/resolve-app-language";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

/** Formats major units for quotation preview (Latin digits, language-aware locale). */
function money(value: number | null | undefined, currency?: string | null, language?: string | null) {
  if (value == null || Number.isNaN(Number(value))) return formatBillingCurrency(value, currency ?? undefined);
  const code = currency || "USD";
  const lang = (language || "en").toLowerCase();
  const locale = lang.startsWith("ar") ? "ar-EG-u-nu-latn" : "en-EG-u-nu-latn";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(Number(value));
  } catch {
    return formatBillingCurrency(value, code);
  }
}

type QuoteWizardTab = "products" | "pricing" | "preview";

const QUOTE_TAB_ORDER: readonly QuoteWizardTab[] = ["products", "pricing", "preview"];

const QUOTE_DOC_COPY: Record<
  string,
  {
    quotation: string;
    preparedFor: string;
    currency: string;
    validityNote: string;
    validUntil: string;
    product: string;
    qty: string;
    unit: string;
    total: string;
    subtotal: string;
    discount: string;
    grandTotal: string;
    draft: string;
  }
> = {
  ar: {
    quotation: "عرض سعر",
    preparedFor: "مُعدّ لـ",
    currency: "العملة",
    validityNote: "العرض صالح لمدة ١٤ يومًا من تاريخ الإنشاء",
    validUntil: "صالح حتى",
    product: "المنتج",
    qty: "الكمية",
    unit: "سعر الوحدة",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    grandTotal: "الإجمالي النهائي",
    draft: "مسودة",
  },
  en: {
    quotation: "Quotation",
    preparedFor: "Prepared for",
    currency: "Currency",
    validityNote: "Valid for 14 days from creation date",
    validUntil: "Valid until",
    product: "Product",
    qty: "Qty",
    unit: "Unit",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    grandTotal: "Grand Total",
    draft: "Draft",
  },
};

function quoteDocCopy(language: string | null | undefined) {
  const code = (language || "en").toLowerCase();
  return QUOTE_DOC_COPY[code] ?? QUOTE_DOC_COPY.en;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold capitalize tracking-wide">
      {status.replaceAll("_", " ")}
    </span>
  );
}

function PricingTable({
  lines,
  currency,
  editable,
  canRemove,
  onUpdate,
  onRemove,
}: {
  lines: readonly QuoteLineItemReadModel[];
  currency: string;
  editable: boolean;
  canRemove?: boolean;
  onUpdate: (lineId: string, patch: { quantity?: number; unitPrice?: number; discountPercent?: number; taxPercent?: number }) => void;
  onRemove: (lineId: string) => void;
}) {
  const showRemove = canRemove ?? editable;

  if (!lines.length) {
    return (
      <EnterpriseEmptyState
        icon={<FileText className="size-6" aria-hidden />}
        title="No line items"
        description="Add a product from the catalog, set the price, then send."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-semibold">Product</th>
            <th className="px-3 py-2.5 font-semibold">Qty</th>
            <th className="px-3 py-2.5 font-semibold">Unit price</th>
            <th className="px-3 py-2.5 font-semibold">Disc %</th>
            <th className="px-3 py-2.5 font-semibold text-right">Total</th>
            {showRemove ? <th className="px-3 py-2.5" /> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const canEditLine = editable && !["section", "note"].includes(line.lineKind);
            return (
              <tr key={line.id} className="border-t border-border/50">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{line.productName || line.sectionTitle || line.lineKind}</div>
                </td>
                <td className="px-3 py-2.5">
                  {canEditLine ? (
                    <Input
                      type="number"
                      className="h-8 w-20"
                      defaultValue={line.quantity}
                      onBlur={(e) => onUpdate(line.id, { quantity: Number(e.target.value) })}
                    />
                  ) : (
                    <span className="tabular-nums">{line.quantity}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {canEditLine ? (
                    <Input
                      type="number"
                      className="h-8 w-28"
                      defaultValue={line.unitPrice}
                      onBlur={(e) => onUpdate(line.id, { unitPrice: Number(e.target.value) })}
                    />
                  ) : (
                    <span className="tabular-nums">{money(line.unitPrice, currency)}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {canEditLine ? (
                    <Input
                      type="number"
                      className="h-8 w-20"
                      defaultValue={line.discountPercent}
                      onBlur={(e) => onUpdate(line.id, { discountPercent: Number(e.target.value) })}
                    />
                  ) : (
                    <span className="tabular-nums">{line.discountPercent}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {money(line.total, currency)}
                </td>
                {showRemove ? (
                  <td className="px-3 py-2.5 text-right">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.id)}>
                      Remove
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuoteHeader({
  quote,
  onClose,
  actions,
  companyName,
}: {
  quote: QuoteReadModel;
  onClose: () => void;
  actions: ReactNode;
  companyName: string | null;
}) {
  const { t } = useTranslation("common");
  return (
    <header className="shrink-0 border-b border-border/60 bg-background px-5 py-4 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="truncate text-[1.25rem] font-semibold tracking-[-0.02em]">
              {quote.title || quote.quoteNumber}
            </h2>
            <StatusBadge status={quote.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {quote.quoteNumber}
            {companyName ? ` · ${companyName}` : ""}
            {quote.contactName ? ` · ${quote.contactName}` : ""}
            {quote.validUntil
              ? ` · ${t("opportunities360.quoteTabs.validUntil")} ${quote.validUntil}`
              : ""}
          </p>
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}

function QuoteBrandMark({
  companyName,
  logoUrl,
  className,
}: {
  companyName: string | null;
  logoUrl: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [logoUrl]);

  // Prefer a plain <img> (quotation document). Fall back to CompanyLogo initials if load fails.
  if (logoUrl && !broken) {
    return (
      <img
        key={logoUrl}
        src={logoUrl}
        alt={companyName || ""}
        className={cn("h-14 w-auto max-w-[200px] object-contain", className)}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <CompanyLogo
      key={logoUrl ?? "fallback"}
      name={companyName || "Q"}
      logoUrl={logoUrl}
      className={cn("size-14 shrink-0 rounded-xl", className)}
    />
  );
}

function QuotePreviewDocument({
  quote,
  lines,
  logoUrl,
  companyName,
  language,
}: {
  quote: QuoteReadModel;
  lines: readonly QuoteLineItemReadModel[];
  logoUrl: string | null;
  companyName: string | null;
  language: string;
}) {
  const copy = quoteDocCopy(language);
  const isRtl = language.toLowerCase() === "ar";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="mx-auto w-full max-w-3xl rounded-xl border border-border/60 bg-background p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/50 pb-5">
        <div className="flex items-center gap-3">
          <QuoteBrandMark companyName={companyName} logoUrl={logoUrl} />
          <div>
            <div className="text-[15px] font-semibold">{companyName || "—"}</div>
            <div className="text-[12px] text-muted-foreground">{copy.quotation}</div>
          </div>
        </div>
        <div className={cn("text-[13px]", isRtl ? "text-start" : "text-end")}>
          <div className="font-semibold">{quote.quoteNumber}</div>
          <div className="text-muted-foreground">
            {quote.status === "draft" ? copy.draft : quote.status.replaceAll("_", " ")}
          </div>
          {quote.validUntil ? (
            <div className="text-muted-foreground">
              {copy.validUntil} {quote.validUntil}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2 text-[13px] sm:grid-cols-2">
        <div>
          <div className="text-[11px] text-muted-foreground">{copy.preparedFor}</div>
          <div className="font-medium">{quote.contactName || quote.title || "—"}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">{copy.currency}</div>
          <div className="font-medium">{quote.currency}</div>
        </div>
        {quote.validUntil ? (
          <div className="sm:col-span-2">
            <div className="text-[11px] text-muted-foreground">{copy.validityNote}</div>
            <div className="font-medium">
              {copy.validUntil} {quote.validUntil}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border/50">
        <table className="w-full text-start text-[13px]">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">{copy.product}</th>
              <th className="px-3 py-2 font-semibold">{copy.qty}</th>
              <th className="px-3 py-2 font-semibold">{copy.unit}</th>
              <th className={cn("px-3 py-2 font-semibold", isRtl ? "text-start" : "text-end")}>
                {copy.total}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-border/40">
                <td className="px-3 py-2.5 font-medium">
                  {line.productName || line.sectionTitle || line.lineKind}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{line.quantity}</td>
                <td className="px-3 py-2.5 tabular-nums">
                  {money(line.unitPrice, quote.currency, language)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 font-medium tabular-nums",
                    isRtl ? "text-start" : "text-end",
                  )}
                >
                  {money(line.total, quote.currency, language)}
                </td>
              </tr>
            ))}
            {!lines.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  —
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-end">
        <dl className="w-full max-w-xs space-y-1.5 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{copy.subtotal}</dt>
            <dd className="tabular-nums">{money(quote.subtotal, quote.currency, language)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{copy.discount}</dt>
            <dd className="tabular-nums">{money(quote.discountTotal, quote.currency, language)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border/50 pt-2 text-[15px] font-semibold">
            <dt>{copy.grandTotal}</dt>
            <dd className="tabular-nums">{money(quote.grandTotal, quote.currency, language)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function Quote360Workspace({
  quoteId,
  open,
  onOpenChange,
  onVersionCreated: _onVersionCreated,
  initialTab = "products",
  contactPhone = null,
  contactEmail = null,
}: {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionCreated?: (quoteId: string) => void;
  initialTab?: "products" | "pricing" | "preview";
  contactPhone?: string | null;
  contactEmail?: string | null;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const { resolvedTheme } = useTheme();
  const { displayName, identity } = useCompanyIdentity(Boolean(company?.id));
  const brandLogos = useResolvedCompanyLogos();
  const { data, isLoading, isError, refetch } = useQuote360(quoteId);
  const commands = useQuoteCommands();
  const productCommands = useProductCommands();
  const catalog = useProductCatalog({ activeOnly: true });
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreateProduct = isSuperAdmin || hasPermission("products.create");

  const [productQuery, setProductQuery] = useState("");
  const [tab, setTab] = useState<QuoteWizardTab>(initialTab);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [pricingDirty, setPricingDirty] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<AppLanguage>("en");

  const quote = data?.quote ?? null;
  const lines = data?.lines ?? [];
  const editable = quote ? ["draft", "internal_review"].includes(quote.status) : false;

  useEffect(() => {
    if (open) {
      setTab(initialTab === "preview" || initialTab === "pricing" ? initialTab : "products");
      setPricingDirty(false);
    }
  }, [open, quoteId, initialTab]);

  useEffect(() => {
    const lang = (quote?.language || "en").toLowerCase();
    setPreviewLanguage(lang === "ar" ? "ar" : lang === "en" ? "en" : "en");
  }, [quote?.id, quote?.language]);

  const filteredProducts = useMemo(() => {
    const items = catalog.data?.items ?? [];
    const q = productQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 12);
  }, [catalog.data?.items, productQuery]);

  const phone = (contactPhone || "").trim();
  const email = (contactEmail || "").trim();
  const waPhone = phone.replace(/[^\d+]/g, "");
  const companyName = displayName || company?.name || null;
  // Exact same resolution path as AppSidebar chrome logo.
  const logoUrl = useMemo(() => {
    const chrome = pickChromeLogo(brandLogos, {
      theme: resolvedTheme === "dark" ? "dark" : "light",
    });
    return (
      chrome ||
      brandLogos.primary ||
      identity?.logoUrl ||
      identity?.logos?.main ||
      company?.logo_url ||
      null
    );
  }, [brandLogos, resolvedTheme, identity?.logoUrl, identity?.logos?.main, company?.logo_url]);

  const previousTab = useMemo(() => {
    const index = QUOTE_TAB_ORDER.indexOf(tab);
    return index > 0 ? QUOTE_TAB_ORDER[index - 1] : null;
  }, [tab]);

  const handleBack = () => {
    if (previousTab) {
      setTab(previousTab);
      return;
    }
    // First wizard step → return to Opportunity360 (do not dismiss the parent).
    onOpenChange(false);
  };

  const languageOptions = useMemo(
    () =>
      SUPPORTED_APP_LANGUAGES.map((code) => ({
        code,
        label: t(`languages.${code}`, {
          defaultValue:
            code === "ar"
              ? t("languages.arabic")
              : code === "en"
                ? t("languages.english")
                : code.toUpperCase(),
        }),
      })),
    [t],
  );

  const markSentAndOpen = (channel: "email" | "whatsapp") => {
    if (!quote) return;
    void commands.changeStatus
      .mutateAsync({ quoteId: quote.id, status: "sent" })
      .then(() => {
        toast({
          title: t("opportunities.quotes.sendSuccess", { defaultValue: "Quote marked as sent" }),
        });
        const summary =
          `${quote.quoteNumber} · ${quote.title || ""} · ${money(quote.grandTotal, quote.currency)}`.trim();
        if (channel === "email") {
          if (!email) {
            toast({
              variant: "destructive",
              title: t("leads.table.errors.missingEmail", { defaultValue: "No email on contact" }),
            });
            return;
          }
          window.open(
            `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(quote.quoteNumber)}&body=${encodeURIComponent(summary)}`,
            "_self",
          );
          return;
        }
        if (!waPhone) {
          toast({
            variant: "destructive",
            title: t("leads.table.errors.missingPhone", { defaultValue: "No phone on contact" }),
          });
          return;
        }
        window.open(
          `https://wa.me/${waPhone.replace("+", "")}?text=${encodeURIComponent(summary)}`,
          "_blank",
          "noopener,noreferrer",
        );
      })
      .catch((error: unknown) => {
        toast({
          variant: "destructive",
          title: t("opportunities.quotes.sendFailed", { defaultValue: "Could not send quote" }),
          description: resolveApplicationErrorMessage(error),
        });
      });
  };

  const addExistingProduct = (productId: string) => {
    if (!quote) return;
    void commands.addCatalogProduct
      .mutateAsync({ quoteId: quote.id, productId })
      .then(() => {
        toast({
          title: t("opportunities360.quoteTabs.productAdded", {
            defaultValue: "Product added to quote",
          }),
        });
        void catalog.refetch();
      })
      .catch((error: unknown) => {
        toast({
          variant: "destructive",
          title: t("opportunities.quotes.createFailed", { defaultValue: "Could not add product" }),
          description: resolveApplicationErrorMessage(error),
        });
      });
  };

  const saveNewProduct = () => {
    if (!quote || !newName.trim()) return;
    // Internal catalog code — auto-generated so sellers never need to understand SKU.
    const sku = `P-${Date.now().toString(36).toUpperCase()}`;
    void productCommands.create
      .mutateAsync({
        name: newName.trim(),
        sku,
        productType: "product",
        basePrice: newPrice.trim() ? Number(newPrice) : 0,
        currency: quote.currency,
      })
      .then((product) =>
        commands.addCatalogProduct.mutateAsync({
          quoteId: quote.id,
          productId: product.id,
        }),
      )
      .then(() => {
        toast({
          title: t("opportunities360.quoteTabs.productSaved", {
            defaultValue: "Product saved and added",
          }),
        });
        setNewName("");
        setNewPrice("");
        void catalog.refetch();
      })
      .catch((error: unknown) => {
        toast({
          variant: "destructive",
          title: t("products.createFailed", { defaultValue: "Could not create product" }),
          description: resolveApplicationErrorMessage(error),
        });
      });
  };

  const savePricingAndPreview = () => {
    setPricingDirty(false);
    toast({
      title: t("opportunities360.quoteTabs.pricingSaved", {
        defaultValue: "Pricing saved",
      }),
    });
    setTab("preview");
  };

  const setQuoteLanguage = (language: AppLanguage) => {
    if (!quote || previewLanguage === language) return;
    setPreviewLanguage(language);
    void commands.updateDetails
      .mutateAsync({ quoteId: quote.id, language })
      .then(() => {
        toast({
          title: t("opportunities360.quoteTabs.languageSaved", {
            defaultValue: "Quote language updated",
          }),
        });
      })
      .catch((error: unknown) => {
        setPreviewLanguage((quote.language || "en").toLowerCase() === "ar" ? "ar" : "en");
        toast({
          variant: "destructive",
          title: t("opportunities360.quoteTabs.languageFailed", {
            defaultValue: "Could not update quote language",
          }),
          description: resolveApplicationErrorMessage(error),
        });
      });
  };

  const languageMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!editable || commands.updateDetails.isPending}
          className="gap-1.5"
        >
          <Globe className="size-3.5" />
          {languageOptions.find((o) => o.code === previewLanguage)?.label ??
            previewLanguage.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {languageOptions.map((option) => (
          <DropdownMenuItem
            key={option.code}
            disabled={option.code === previewLanguage}
            onClick={() => setQuoteLanguage(option.code)}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(ENTITY_360_DIALOG_CONTENT_CLASS, "sm:max-w-[1100px]")}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">{quote?.title || quote?.quoteNumber || "Quote"}</DialogTitle>
        {isLoading ? (
          <div className="space-y-4 p-6" aria-busy="true">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError || !quote ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <p className="text-sm text-muted-foreground">
              {t("quotes.loadError", { defaultValue: "Unable to load quote." })}
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <QuoteHeader
              quote={quote}
              companyName={companyName}
              onClose={() => onOpenChange(false)}
              actions={null}
            />

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as QuoteWizardTab)}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-5 sm:px-7">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 px-2 text-[12px] text-muted-foreground"
                  onClick={handleBack}
                >
                  <ArrowLeft className="size-3.5 rtl:rotate-180" />
                  {t("opportunities360.quoteTabs.back")}
                </Button>
                <TabsList className="h-auto flex-1 justify-start gap-1 bg-transparent p-0 py-2">
                  {(
                    [
                      ["products", t("opportunities360.quoteTabs.products")],
                      ["pricing", t("opportunities360.quoteTabs.pricing")],
                      ["preview", t("opportunities360.quoteTabs.preview")],
                    ] as const
                  ).map(([id, label]) => (
                    <TabsTrigger
                      key={id}
                      value={id}
                      className="rounded-md px-3 py-1.5 text-[13px] data-[state=active]:bg-muted"
                    >
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7">
                <TabsContent value="products" className="mt-0 space-y-4">
                  <p className="text-[13px] text-muted-foreground">
                    {t("opportunities360.quoteTabs.productsHint")}
                  </p>

                  {editable ? (
                    <div className="space-y-3 rounded-xl border border-border/60 p-4">
                      <h4 className="text-[13px] font-semibold">
                        {t("opportunities360.quoteTabs.pickExisting", {
                          defaultValue: "Choose existing product",
                        })}
                      </h4>
                      <Input
                        placeholder={t("opportunities360.quoteTabs.searchCatalog")}
                        value={productQuery}
                        onChange={(e) => setProductQuery(e.target.value)}
                        className="max-w-md"
                      />
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {filteredProducts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-start text-[13px] hover:bg-muted/60"
                            disabled={commands.addCatalogProduct.isPending}
                            onClick={() => addExistingProduct(p.id)}
                          >
                            <span className="font-medium">{p.name}</span>
                            <Plus className="size-3.5 text-muted-foreground" />
                          </button>
                        ))}
                        {!filteredProducts.length ? (
                          <p className="px-1 py-2 text-[13px] text-muted-foreground">
                            {t("opportunities360.quoteTabs.noProducts")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {editable && canCreateProduct ? (
                    <div className="space-y-3 rounded-xl border border-border/60 p-4">
                      <h4 className="text-[13px] font-semibold">
                        {t("opportunities360.quoteTabs.createNew", {
                          defaultValue: "Or create a new product",
                        })}
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="quote-new-name">
                            {t("opportunities360.quoteTabs.productName")}
                          </Label>
                          <Input
                            id="quote-new-name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="quote-new-price">
                            {t("opportunities360.quoteTabs.unitPrice")}
                          </Label>
                          <Input
                            id="quote-new-price"
                            type="number"
                            min={0}
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        disabled={!newName.trim() || productCommands.create.isPending}
                        onClick={saveNewProduct}
                      >
                        {productCommands.create.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        {t("opportunities360.quoteTabs.saveProduct", {
                          defaultValue: "Save product",
                        })}
                      </Button>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <h4 className="text-[13px] font-semibold">
                      {t("opportunities360.quoteTabs.quoteLines", {
                        defaultValue: "Products on this quote",
                      })}
                    </h4>
                    <PricingTable
                      lines={lines}
                      currency={quote.currency}
                      editable={false}
                      canRemove={editable}
                      onUpdate={() => undefined}
                      onRemove={(lineId) =>
                        void commands.removeLine.mutateAsync({ quoteId: quote.id, lineId })
                      }
                    />
                    {editable ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          disabled={lines.length === 0}
                          onClick={() => setTab("pricing")}
                        >
                          {t("opportunities360.quoteTabs.saveContinuePricing", {
                            defaultValue: "Save & continue to pricing",
                          })}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 space-y-4">
                  <p className="text-[13px] text-muted-foreground">
                    {t("opportunities360.quoteTabs.pricingHint")}
                  </p>
                  <PricingTable
                    lines={lines}
                    currency={quote.currency}
                    editable={editable}
                    onUpdate={(lineId, patch) => {
                      setPricingDirty(true);
                      void commands.updateLine.mutateAsync({
                        quoteId: quote.id,
                        lineId,
                        ...patch,
                      });
                    }}
                    onRemove={(lineId) =>
                      void commands.removeLine.mutateAsync({ quoteId: quote.id, lineId })
                    }
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/10 px-4 py-3 text-[13px]">
                    <span className="font-semibold tabular-nums">
                      {money(quote.grandTotal, quote.currency)}
                    </span>
                    {editable ? (
                      <Button type="button" onClick={savePricingAndPreview}>
                        {pricingDirty || commands.updateLine.isPending
                          ? t("opportunities360.quoteTabs.savePricing", {
                              defaultValue: "Save pricing & preview",
                            })
                          : t("opportunities360.quoteTabs.continuePreview", {
                              defaultValue: "Continue to preview",
                            })}
                      </Button>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="preview" className="mt-0 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] text-muted-foreground">
                      {t("opportunities360.quoteTabs.previewHint", {
                        defaultValue: "Choose quotation language, then send.",
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {languageMenu}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            disabled={commands.changeStatus.isPending || lines.length === 0}
                            className="gap-1.5"
                          >
                            <Send className="size-3.5" />
                            {t("opportunities360.actions.sendQuote")}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={!email}
                            onClick={() => markSentAndOpen("email")}
                          >
                            <Mail className="size-3.5" />
                            {t("opportunities360.actions.sendEmail")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!waPhone}
                            onClick={() => markSentAndOpen("whatsapp")}
                          >
                            <MessageCircle className="size-3.5" />
                            {t("opportunities360.actions.sendWhatsapp")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <QuotePreviewDocument
                    quote={quote}
                    lines={lines}
                    logoUrl={logoUrl}
                    companyName={companyName}
                    language={previewLanguage}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OpportunityQuotesPanel({
  opportunityId,
  onOpenQuote,
  showCreateButton = true,
}: {
  opportunityId: string;
  onOpenQuote: (quoteId: string) => void;
  /** When false, create lives in Opportunity360 header only (avoids duplicate CTAs). */
  showCreateButton?: boolean;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canView = isSuperAdmin || hasPermission("quotes.view");
  const canCreate = isSuperAdmin || hasPermission("quotes.create");
  const quotes = useOpportunityQuotes(opportunityId);
  const commands = useQuoteCommands();
  const loadErrorToasted = useRef(false);

  const failToast = useCallback(
    (titleKey: string, error?: unknown) => {
      toast({
        variant: "destructive",
        title: t(titleKey),
        description: resolveApplicationErrorMessage(error),
      });
    },
    [toast, t],
  );

  const successToast = useCallback(
    (titleKey: string) => {
      toast({ title: t(titleKey) });
    },
    [toast, t],
  );

  useEffect(() => {
    if (!canView) return;
    if (quotes.isError && !loadErrorToasted.current) {
      loadErrorToasted.current = true;
      failToast("opportunities.quotes.loadError", quotes.error);
    }
    if (!quotes.isError) {
      loadErrorToasted.current = false;
    }
  }, [canView, quotes.isError, quotes.error, failToast]);

  if (!canView) {
    return (
      <EnterpriseEmptyState
        compact
        icon={<FileText className="size-6" aria-hidden />}
        title={t("opportunities.quotes.permissionDenied")}
        description={t("opportunities.quotes.permissionDeniedBody")}
      />
    );
  }

  if (quotes.isLoading) {
    return <OpportunityQuotesPanelSkeleton canCreate={canCreate && showCreateButton} />;
  }

  if (quotes.isError) {
    return (
      <EnterpriseEmptyState
        compact
        icon={<FileText className="size-6" aria-hidden />}
        title={t("opportunities.quotes.loadError")}
        description={t("opportunities.quotes.loadErrorBody")}
        primaryAction={{
          label: t("buttons.refresh"),
          onClick: () => void quotes.refetch(),
        }}
      />
    );
  }

  const items = quotes.data?.items ?? [];

  return (
    <div className="min-h-[180px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">
            {t("opportunities.quotes.panelTitle")}
          </h3>
          <p className="text-[13px] text-muted-foreground">{t("opportunities.quotes.panelBody")}</p>
        </div>
        {canCreate && showCreateButton ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            disabled={commands.createFromOpportunity.isPending}
            onClick={() => {
              void commands.createFromOpportunity
                .mutateAsync({ opportunityId })
                .then((result) => {
                  successToast("opportunities.quotes.createSuccess");
                  onOpenQuote(result.quote.id);
                })
                .catch((error) => failToast("opportunities.quotes.createFailed", error));
            }}
          >
            {commands.createFromOpportunity.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-3.5" />
            )}
            {t("opportunities.quotes.create")}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EnterpriseEmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title={t("opportunities.quotes.emptyTitle")}
          description={
            canCreate
              ? t("opportunities.quotes.emptyBody")
              : t("opportunities.quotes.createPermissionDeniedBody")
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((q) => (
            <button
              key={q.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-left transition hover:bg-muted/40"
              onClick={() => onOpenQuote(q.id)}
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">
                  {q.quoteNumber} · v{q.versionNumber}
                </div>
                <div className="truncate text-[12px] capitalize text-muted-foreground">
                  {q.status.replaceAll("_", " ")} · {money(q.grandTotal, q.currency)}
                </div>
              </div>
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityQuotesPanelSkeleton({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="min-h-[180px] space-y-4" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        {canCreate ? <Skeleton className="h-8 w-32 shrink-0" /> : null}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[52px] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
