import { Package, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { CatalogProductReadModel, ProductHistoryReadModel } from "@workspace/application-layer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import {
  ENTITY_360_DIALOG_CONTENT_CLASS,
  ENTITY_360_TAB_TRIGGER_CLASS,
  ENTITY_360_TABS_LIST_CLASS,
} from "@/components/entity-workspace/entity-360-dialog-shell";
import {
  useOpportunityLineItems,
  useProduct360,
  useProductCatalog,
  useProductCategories,
  useProductCommands,
} from "@/hooks/products/use-product-commands";
import {
  PRODUCT_TYPES,
  catalogCustomerUnitPrice,
  computeProductTaxBreakdown,
  displayProductAliases,
  normalizePriceTaxMode,
  parseTaxPercentInput,
  type ProductPriceTaxMode,
} from "@workspace/product-platform";
import { ProductTaxFields } from "@/components/products/product-tax-fields";
import { useAuthUser } from "@/hooks/use-rbac";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { useToast } from "@/hooks/use-toast";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import { formatOpportunityMoney } from "@/components/opportunities/opportunity360-ui";
import { formatBillingCurrency } from "@/lib/billing/format";
import { PRODUCT_UNITS } from "@/lib/product-platform/product-units";
import {
  ProductAliasesField,
  aliasesListToText,
  aliasesTextToList,
} from "@/components/products/product-aliases-field";
import { isLoginAppProductAliasGenerationEnabled } from "@/lib/product-platform/product-alias-generation-flag.js";
import { localizeProductType } from "@/lib/sales/sales-localize";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { ProductImageEditor } from "@/components/products/product-image-editor";
import { cn } from "@/lib/utils";

const PRODUCT_TABS = [
  "overview",
  "pricing",
  "availability",
  "documents",
  "ai",
  "audit",
] as const;

const BILLING_INTERVALS = ["month", "year", "quarter"] as const;
type BillingInterval = (typeof BILLING_INTERVALS)[number];
type BillingMode = "one_time" | BillingInterval;

function supportsBilling(productType: string): boolean {
  return productType === "service" || productType === "subscription";
}

function resolveBillingMode(product: CatalogProductReadModel): BillingMode {
  if (
    product.subscriptionInterval &&
    BILLING_INTERVALS.includes(product.subscriptionInterval as BillingInterval)
  ) {
    return product.subscriptionInterval as BillingInterval;
  }
  return product.productType === "subscription" ? "month" : "one_time";
}

function catalogLabel(t: TFunction, key: string, fallback: string) {
  return t(key, { defaultValue: fallback });
}

function productEnteredPrice(product: CatalogProductReadModel): number {
  return product.subscriptionPrice != null && product.subscriptionInterval
    ? product.subscriptionPrice
    : product.basePrice;
}

function productTaxBreakdown(product: CatalogProductReadModel) {
  return computeProductTaxBreakdown({
    enteredPrice: productEnteredPrice(product),
    taxMode: product.priceTaxMode,
    taxPercent: product.taxPercent,
  });
}

function historyEventLabel(t: TFunction, eventType: string) {
  return catalogLabel(t, `products.workspace.events.${eventType}`, eventType);
}

function ProductAuditActor({ userId }: { userId: string | null }) {
  const { t } = useTranslation("common");
  const { data: identity } = useEmployeeIdentity(userId);
  const name = identity?.fullName?.trim();
  if (name) return <span className="font-medium">{name}</span>;
  return (
    <span className="text-muted-foreground">{t("products.workspace.audit.unknownActor")}</span>
  );
}

/** Catalog product workspace — company default when no explicit currency. */
function money(value: number | null | undefined, currency?: string | null) {
  return formatBillingCurrency(value, currency ?? undefined);
}

/** Opportunity360 products tab — opportunity record currency only. */
function opportunityMoney(value: number | null | undefined, currency?: string | null) {
  return formatOpportunityMoney(value, currency);
}

function OpportunityLineEditableNumber({
  value,
  disabled,
  min,
  max,
  step,
  className,
  onSave,
}: {
  value: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: string;
  className?: string;
  onSave: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const next = Number(draft);
    if (Number.isNaN(next) || next === value) return;
    if (min != null && next < min) return;
    if (max != null && next > max) return;
    onSave(next);
  };

  return (
    <Input
      type="number"
      className={className}
      value={draft}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ProductHeader({
  product,
  canDelete,
  deletePending,
  onDelete,
  onClose,
}: {
  product: CatalogProductReadModel;
  canDelete?: boolean;
  deletePending?: boolean;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const taxLabel = t(`products.tax.${normalizePriceTaxMode(product.priceTaxMode)}`);
  const customerPrice = catalogCustomerUnitPrice(product);

  return (
    <header className="shrink-0 border-b border-border/60 px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="truncate text-[1.35rem] font-semibold tracking-[-0.03em]">{product.name}</h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-medium">
              {localizeProductType(t, product.productType)}
            </span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[12px] font-medium",
                product.isActive
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {product.isActive ? t("products.status.active") : t("products.status.inactive")}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {t("products.workspace.sku")} · {product.sku}
            {product.brand ? ` · ${product.brand}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <span className="font-semibold tabular-nums">
              {product.subscriptionPrice != null && product.subscriptionInterval
                ? t("products.billing.pricePer", {
                    price: money(customerPrice, product.currency),
                    interval: t(`products.billing.intervals.${product.subscriptionInterval}`, {
                      defaultValue: product.subscriptionInterval,
                    }),
                  })
                : money(customerPrice, product.currency)}
            </span>
            {product.marginPercent != null ? (
              <span className="text-muted-foreground">
                {t("products.workspace.margin")} · {product.marginPercent}%
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {t("products.workspace.tax")} · {taxLabel}
              {product.taxPercent > 0 ? ` · ${product.taxPercent}%` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canDelete ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deletePending}
              onClick={onDelete}
            >
              {t("products.workspace.delete")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("products.workspace.close")}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

const PRODUCT_CURRENCIES = ["EGP", "USD", "SAR", "AED", "EUR"] as const;

function ProductDetailsEditor({
  product,
  canPrice,
  pending,
  onCancel,
  onSave,
  onRetryAliasGeneration,
  aliasRetryPending,
}: {
  product: CatalogProductReadModel;
  canPrice: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (patch: {
    name: string;
    sku: string;
    description: string;
    brand: string;
    productType: string;
    categoryId: string | null;
    isActive: boolean;
    unit: string;
    trackInventory: boolean;
    stockQuantity: number | null;
    aliases?: string[];
    basePrice?: number;
    currency?: string;
    cost?: number | null;
    priceTaxMode?: ProductPriceTaxMode;
    taxPercent?: number;
    subscriptionInterval?: "month" | "year" | "quarter" | null;
    subscriptionPrice?: number | null;
  }) => void;
  onRetryAliasGeneration?: () => void;
  aliasRetryPending?: boolean;
}) {
  const { t } = useTranslation("common");
  const categories = useProductCategories();
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [description, setDescription] = useState(product.description);
  const [brand, setBrand] = useState(product.brand);
  const [aliasesText, setAliasesText] = useState(aliasesListToText(product.aliases));
  useEffect(() => {
    setAliasesText(aliasesListToText(product.aliases));
  }, [product.id, product.aliases, product.updatedAt]);
  const [productType, setProductType] = useState<string>(product.productType);
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "none");
  const [isActive, setIsActive] = useState(product.isActive);
  const [billingMode, setBillingMode] = useState<BillingMode>(resolveBillingMode(product));
  const [basePrice, setBasePrice] = useState(
    String(
      product.subscriptionPrice != null && product.subscriptionInterval
        ? product.subscriptionPrice
        : product.basePrice,
    ),
  );
  const [currency, setCurrency] = useState(product.currency || "EGP");
  const [priceTaxMode, setPriceTaxMode] = useState<ProductPriceTaxMode>(
    normalizePriceTaxMode(product.priceTaxMode),
  );
  const [taxPercent, setTaxPercent] = useState(
    product.taxPercent == null || product.taxPercent === 0 ? "" : String(product.taxPercent),
  );
  const [cost, setCost] = useState(product.cost == null ? "" : String(product.cost));
  const [unit, setUnit] = useState(product.unit || "each");
  const [trackInventory, setTrackInventory] = useState(product.trackInventory ? "yes" : "no");
  const [stockQuantity, setStockQuantity] = useState(
    product.stockQuantity == null ? "" : String(product.stockQuantity),
  );
  const unitOptions = PRODUCT_UNITS.includes(unit as (typeof PRODUCT_UNITS)[number])
    ? PRODUCT_UNITS
    : ([unit, ...PRODUCT_UNITS] as const);
  const price = Number(basePrice);
  const costValue = cost.trim() === "" ? null : Number(cost);
  const parsedTaxPercent = parseTaxPercentInput(taxPercent.trim() === "" ? 0 : taxPercent);
  const canSave =
    name.trim().length > 0 &&
    sku.trim().length > 0 &&
    (!canPrice ||
      (Number.isFinite(price) &&
        price >= 0 &&
        parsedTaxPercent != null &&
        (costValue == null || (Number.isFinite(costValue) && costValue >= 0))));

  const onProductTypeChange = (nextType: string) => {
    setProductType(nextType);
    if (nextType === "subscription") setBillingMode("month");
    else if (!supportsBilling(nextType)) setBillingMode("one_time");
  };

  return (
    <form
      className="space-y-3 rounded-xl border border-border/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || pending) return;
        const recurring =
          supportsBilling(productType) && billingMode !== "one_time"
            ? (billingMode as BillingInterval)
            : null;
        onSave({
          name: name.trim(),
          sku: sku.trim(),
          description: description.trim(),
          brand: brand.trim(),
          productType,
          categoryId: categoryId === "none" ? null : categoryId,
          isActive,
          unit: unit.trim() || "each",
          trackInventory: trackInventory === "yes",
          stockQuantity:
            trackInventory === "yes"
              ? stockQuantity.trim() === ""
                ? 0
                : Number(stockQuantity)
              : null,
          aliases: aliasesTextToList(aliasesText),
          ...(canPrice
            ? {
                basePrice: price,
                currency,
                cost: costValue,
                priceTaxMode,
                taxPercent: parsedTaxPercent ?? 0,
                subscriptionInterval: recurring,
                subscriptionPrice: recurring ? price : null,
              }
            : {}),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="edit-name">{t("products.fields.name")}</Label>
          <Input id="edit-name" value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="edit-sku">{t("products.fields.sku")}</Label>
          <Input id="edit-sku" value={sku} onChange={(event) => setSku(event.target.value)} className="mt-1.5 font-mono" />
        </div>
        <div>
          <Label>{t("products.fields.type")}</Label>
          <Select value={productType} onValueChange={onProductTypeChange}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRODUCT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{localizeProductType(t, type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("products.fields.category")}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("products.columns.uncategorized")}</SelectItem>
              {(categories.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">{t("products.toggle.label")}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t("products.toggle.hint")}</p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            aria-label={t("products.toggle.label")}
          />
        </div>
        <div className="sm:col-span-2">
          <ProductDescriptionEditor
            id="edit-description"
            value={description}
            maxLength={2000}
            rows={6}
            onChange={setDescription}
            placeholder={t("products.placeholders.description")}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="edit-brand">{t("products.fields.brand")}</Label>
          <Input id="edit-brand" value={brand} onChange={(event) => setBrand(event.target.value)} className="mt-1.5" />
        </div>
        <ProductAliasesField
          id="edit-aliases"
          value={aliasesText}
          onChange={setAliasesText}
          disabled={pending || aliasRetryPending}
          generationStatus={product.aliasGeneration?.status}
          onRetryGeneration={onRetryAliasGeneration}
          retryPending={aliasRetryPending}
        />
        <div>
          <Label>{t("products.fields.unit")}</Label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {unitOptions.map((code) => (
                <SelectItem key={code} value={code}>
                  {catalogLabel(t, `products.workspace.units.${code}`, code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("products.fields.trackInventory")}</Label>
          <Select value={trackInventory} onValueChange={setTrackInventory}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">{t("products.inventory.notTracked")}</SelectItem>
              <SelectItem value="yes">{t("products.inventory.tracked")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {trackInventory === "yes" ? (
          <div>
            <Label htmlFor="edit-stock">{t("products.fields.stockQuantity")}</Label>
            <Input
              id="edit-stock"
              type="number"
              min={0}
              step="1"
              value={stockQuantity}
              onChange={(event) => setStockQuantity(event.target.value)}
              className="mt-1.5"
            />
          </div>
        ) : null}
        {canPrice ? (
          <>
            {supportsBilling(productType) ? (
              <div className="sm:col-span-2 space-y-3 rounded-xl border border-border/50 bg-muted/15 p-3">
                <div>
                  <p className="text-[12px] font-semibold">{t("products.sections.billing")}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("products.billing.hint")}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>{t("products.billing.mode")}</Label>
                    <Select
                      value={billingMode === "one_time" ? "one_time" : "recurring"}
                      onValueChange={(value) =>
                        setBillingMode(
                          value === "one_time"
                            ? "one_time"
                            : billingMode === "one_time"
                              ? "month"
                              : billingMode,
                        )
                      }
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_time">{t("products.billing.oneTime")}</SelectItem>
                        <SelectItem value="recurring">{t("products.billing.recurring")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {billingMode !== "one_time" ? (
                    <div>
                      <Label>{t("products.billing.interval")}</Label>
                      <Select
                        value={billingMode}
                        onValueChange={(value) => setBillingMode(value as BillingInterval)}
                      >
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BILLING_INTERVALS.map((interval) => (
                            <SelectItem key={interval} value={interval}>
                              {t(`products.billing.intervals.${interval}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div>
              <Label htmlFor="edit-price">
                {billingMode !== "one_time" && supportsBilling(productType)
                  ? t("products.billing.subscriptionPrice")
                  : t("products.fields.basePrice")}
              </Label>
              <Input id="edit-price" type="number" min={0} step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label>{t("products.fields.currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                  {PRODUCT_CURRENCIES.includes(currency as (typeof PRODUCT_CURRENCIES)[number]) ? null : (
                    <SelectItem value={currency}>{currency}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <ProductTaxFields
              enteredPrice={basePrice}
              currency={currency}
              taxMode={priceTaxMode}
              taxPercent={taxPercent}
              onTaxModeChange={setPriceTaxMode}
              onTaxPercentChange={setTaxPercent}
            />
            <div>
              <Label htmlFor="edit-cost">{t("products.fields.cost")}</Label>
              <Input id="edit-cost" type="number" min={0} step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} className="mt-1.5" />
            </div>
          </>
        ) : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>{t("products.cancel")}</Button>
        <Button type="submit" disabled={!canSave || pending}>{t("products.workspace.save")}</Button>
      </div>
    </form>
  );
}

export function Product360Workspace({
  productId,
  open,
  onOpenChange,
}: {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canEdit = isSuperAdmin || hasPermission("products.edit");
  const canPrice = isSuperAdmin || hasPermission("products.pricing");
  const canDelete = isSuperAdmin || hasPermission("products.delete");
  const aliasGenerationEnabled = isLoginAppProductAliasGenerationEnabled();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useProduct360(productId);
  const commands = useProductCommands();
  const categories = useProductCategories();
  const product = data?.product ?? null;
  useEffect(() => {
    setEditing(false);
    setDeleteOpen(false);
  }, [productId]);
  const [country, setCountry] = useState("");
  const [localPrice, setLocalPrice] = useState("");

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(ENTITY_360_DIALOG_CONTENT_CLASS)} dir={i18n.dir()}>
        {isLoading ? (
          <div className="space-y-4 p-6" aria-busy="true">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError || !product ? (
          <div className="p-6">
            <EnterpriseEmptyState
              icon={<Package className="size-6" aria-hidden />}
              title={t("products.workspace.loadError")}
              description={t("products.workspace.loadErrorBody")}
              primaryAction={{
                label: t("products.workspace.retry"),
                onClick: () => void refetch(),
              }}
            />
          </div>
        ) : (
          <>
            <ProductHeader
              product={product}
              canDelete={canDelete}
              deletePending={commands.archive.isPending}
              onDelete={() => setDeleteOpen(true)}
              onClose={() => onOpenChange(false)}
            />
            <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsList className={ENTITY_360_TABS_LIST_CLASS} dir={i18n.dir()}>
                {PRODUCT_TABS.map((value) => (
                  <TabsTrigger key={value} value={value} className={ENTITY_360_TAB_TRIGGER_CLASS}>
                    {t(`products.workspace.tabs.${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 lg:px-8">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <ProductImageEditor
                    urls={product.imageUrls}
                    disabled={!canEdit || commands.update.isPending}
                    onChange={async (imageUrls) => {
                      try {
                        await commands.update.mutateAsync({ productId: product.id, patch: { imageUrls } });
                        toast({ title: t("products.images.saved") });
                      } catch (error) {
                        toast({
                          title: t("products.images.saveFailed"),
                          description: resolveApplicationErrorMessage(error),
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                  {editing && canEdit ? (
                    <ProductDetailsEditor
                      key={product.updatedAt}
                      product={product}
                      canPrice={canPrice}
                      pending={commands.update.isPending}
                      aliasRetryPending={commands.regenerateAliases.isPending}
                      onRetryAliasGeneration={
                        product.aliasGeneration?.status === "failed"
                          ? () => {
                              commands.regenerateAliases.mutate(
                                { productId: product.id },
                                {
                                  onSuccess: () => {
                                    toast({ title: t("products.aliasGeneration.retryStarted") });
                                  },
                                  onError: (error) => {
                                    toast({
                                      title: t("products.aliasGeneration.retryFailed"),
                                      description: resolveApplicationErrorMessage(error),
                                      variant: "destructive",
                                    });
                                  },
                                },
                              );
                            }
                          : undefined
                      }
                      onCancel={() => setEditing(false)}
                      onSave={(patch) => {
                        commands.update.mutate(
                          { productId: product.id, patch },
                          {
                            onSuccess: () => {
                              setEditing(false);
                              toast({ title: t("products.workspace.saved") });
                            },
                            onError: (error) => {
                              toast({
                                title: t("products.workspace.saveFailed"),
                                description: resolveApplicationErrorMessage(error),
                                variant: "destructive",
                              });
                            },
                          },
                        );
                      }}
                    />
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {t("products.fields.description")}
                          </p>
                          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                            {product.description?.trim()
                              ? product.description
                              : t("products.workspace.noDescription")}
                          </p>
                        </div>
                        {canEdit ? (
                          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(true)}>
                            {t("products.workspace.edit")}
                          </Button>
                        ) : null}
                      </div>

                      <section className="space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {t("products.workspace.sections.identity")}
                        </p>
                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {(
                            [
                              [t("products.fields.name"), product.name],
                              [t("products.workspace.sku"), product.sku],
                              [t("products.workspace.fields.type"), localizeProductType(t, product.productType)],
                              [
                                t("products.workspace.fields.category"),
                                categories.data?.find((category) => category.id === product.categoryId)?.name
                                  || t("products.columns.uncategorized"),
                              ],
                              [
                                t("products.workspace.fields.status"),
                                product.isActive ? t("products.status.active") : t("products.status.inactive"),
                              ],
                              [t("products.workspace.fields.brand"), product.brand?.trim() || "—"],
                            ] as const
                          ).map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-border/60 px-3 py-2.5 text-start">
                              <dt className="m-0 text-[11px] font-medium text-muted-foreground">{label}</dt>
                              <dd className="m-0 mt-1 text-[14px] font-medium break-words">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>

                      <section className="space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {t("products.workspace.sections.pricing")}
                        </p>
                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {(
                            [
                              [
                                t("products.workspace.fields.customerPrice"),
                                money(catalogCustomerUnitPrice(product), product.currency),
                              ],
                              [t("products.fields.currency"), product.currency],
                              [
                                t("products.workspace.fields.taxMode"),
                                t(`products.tax.${normalizePriceTaxMode(product.priceTaxMode)}`),
                              ],
                              [t("products.workspace.fields.taxPercent"), `${product.taxPercent ?? 0}%`],
                              [
                                t("products.workspace.fields.netPrice"),
                                money(productTaxBreakdown(product).net, product.currency),
                              ],
                              [
                                t("products.workspace.fields.cost"),
                                product.cost != null ? money(product.cost, product.currency) : "—",
                              ],
                              product.marginPercent != null
                                ? [t("products.workspace.margin"), `${product.marginPercent}%`]
                                : null,
                              product.subscriptionPrice != null && product.subscriptionInterval
                                ? [
                                    t("products.billing.subscriptionPrice"),
                                    t("products.billing.pricePer", {
                                      price: money(product.subscriptionPrice, product.currency),
                                      interval: t(
                                        `products.billing.intervals.${product.subscriptionInterval}`,
                                        { defaultValue: product.subscriptionInterval },
                                      ),
                                    }),
                                  ]
                                : null,
                            ] as Array<[string, string] | null>
                          )
                            .filter((row): row is [string, string] => row != null)
                            .map(([label, value]) => (
                              <div key={label} className="rounded-xl border border-border/60 px-3 py-2.5 text-start">
                                <dt className="m-0 text-[11px] font-medium text-muted-foreground">{label}</dt>
                                <dd className="m-0 mt-1 text-[14px] font-medium tabular-nums">{value}</dd>
                              </div>
                            ))}
                        </dl>
                      </section>

                      <section className="space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {t("products.workspace.sections.inventory")}
                        </p>
                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {(
                            [
                              [
                                t("products.workspace.fields.unit"),
                                catalogLabel(t, `products.workspace.units.${product.unit}`, product.unit),
                              ],
                              [
                                t("products.workspace.fields.inventory"),
                                product.trackInventory
                                  ? t("products.workspace.inventoryTracked", {
                                      count: product.stockQuantity ?? 0,
                                      unit: catalogLabel(
                                        t,
                                        `products.workspace.units.${product.unit}`,
                                        product.unit,
                                      ),
                                    })
                                  : t("products.workspace.inventoryNotTracked"),
                              ],
                              product.trackInventory
                                ? [t("products.fields.stockQuantity"), String(product.stockQuantity ?? 0)]
                                : null,
                            ] as Array<[string, string] | null>
                          )
                            .filter((row): row is [string, string] => row != null)
                            .map(([label, value]) => (
                              <div key={label} className="rounded-xl border border-border/60 px-3 py-2.5 text-start">
                                <dt className="m-0 text-[11px] font-medium text-muted-foreground">{label}</dt>
                                <dd className="m-0 mt-1 text-[14px] font-medium">{value}</dd>
                              </div>
                            ))}
                        </dl>
                      </section>

                      {product.tags.length ? (
                        <section className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {t("products.fields.tags")}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {product.tags.map((tag) => (
                              <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-[12px]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      <section className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                          {t("products.fields.aliases")}
                        </p>
                        {displayProductAliases(product.aliases).length ? (
                          <div className="flex flex-wrap gap-2">
                            {displayProductAliases(product.aliases).map((alias) => (
                              <span
                                key={alias}
                                className="rounded-md border border-border/60 px-2 py-0.5 text-[12px]"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[13px] text-muted-foreground">—</p>
                        )}
                        {product.aliasGeneration?.status === "pending" ? (
                          <p className="text-[11px] text-muted-foreground">
                            {t("products.aliasGeneration.pending")}
                          </p>
                        ) : null}
                        {product.aliasGeneration?.status === "completed" &&
                        displayProductAliases(product.aliases).length ? (
                          <p className="text-[11px] text-muted-foreground">
                            {t("products.aliasGeneration.completed")}
                          </p>
                        ) : null}
                        {product.aliasGeneration?.status === "failed" ? (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            {t("products.aliasGeneration.failed")}
                          </p>
                        ) : null}
                        {canEdit &&
                        aliasGenerationEnabled &&
                        product.aliasGeneration?.status !== "pending" &&
                        (product.aliasGeneration?.status === "failed" ||
                          displayProductAliases(product.aliases).length === 0) ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={commands.regenerateAliases.isPending}
                            onClick={() => {
                              commands.regenerateAliases.mutate(
                                { productId: product.id },
                                {
                                  onSuccess: () => {
                                    toast({ title: t("products.aliasGeneration.retryStarted") });
                                  },
                                  onError: (error) => {
                                    toast({
                                      title: t("products.aliasGeneration.retryFailed"),
                                      description: resolveApplicationErrorMessage(error),
                                      variant: "destructive",
                                    });
                                  },
                                },
                              );
                            }}
                            data-testid="product-alias-generation-retry-overview"
                          >
                            {commands.regenerateAliases.isPending
                              ? t("products.aliasGeneration.retrying")
                              : product.aliasGeneration?.status === "failed"
                                ? t("products.aliasGeneration.retry")
                                : t("products.aliasGeneration.generate")}
                          </Button>
                        ) : null}
                      </section>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 space-y-4">
                  <section className="rounded-xl border border-border/60 p-4">
                    <h3 className="text-[12px] font-semibold text-muted-foreground">
                      {t("products.workspace.pricing.global")}
                    </h3>
                    <p className="mt-2 text-[18px] font-semibold tabular-nums">
                      {product.subscriptionPrice != null && product.subscriptionInterval
                        ? t("products.billing.pricePer", {
                            price: money(catalogCustomerUnitPrice(product), product.currency),
                            interval: t(`products.billing.intervals.${product.subscriptionInterval}`, {
                              defaultValue: product.subscriptionInterval,
                            }),
                          })
                        : money(catalogCustomerUnitPrice(product), product.currency)}
                    </p>
                    <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">{t("products.tax.net")}</dt>
                        <dd className="font-medium tabular-nums">
                          {money(productTaxBreakdown(product).net, product.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("products.tax.amount")}</dt>
                        <dd className="font-medium tabular-nums">
                          {money(productTaxBreakdown(product).taxAmount, product.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("products.tax.customerTotal")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {money(productTaxBreakdown(product).gross, product.currency)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {t(`products.tax.${normalizePriceTaxMode(product.priceTaxMode)}`)}
                      {product.taxPercent > 0 ? ` · ${product.taxPercent}%` : ""}
                    </p>
                    {product.subscriptionPrice != null && product.subscriptionInterval ? (
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {t("products.workspace.pricing.subscription", {
                          price: money(product.subscriptionPrice, product.currency),
                          interval: catalogLabel(
                            t,
                            `products.workspace.pricing.intervals.${product.subscriptionInterval}`,
                            product.subscriptionInterval,
                          ),
                        })}
                      </p>
                    ) : null}
                  </section>

                  <section className="space-y-3 rounded-xl border border-border/60 p-4">
                    <h3 className="text-[12px] font-semibold text-muted-foreground">
                      {t("products.workspace.pricing.regional")}
                    </h3>
                    {(data?.regional ?? []).length ? (
                      <ul className="space-y-2 text-[13px]">
                        {data!.regional.map((p) => (
                          <li key={p.id} className="flex justify-between gap-3">
                            <span>
                              {[p.country, p.market, p.region].filter(Boolean).join(" · ") ||
                                t("products.workspace.pricing.regionFallback")}
                            </span>
                            <span className="font-medium tabular-nums">
                              {money(p.localPrice, p.currencyOverride || product.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">
                        {t("products.workspace.pricing.emptyRegional")}
                      </p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="reg-country">{t("products.workspace.pricing.country")}</Label>
                        <Input
                          id="reg-country"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          placeholder={t("products.workspace.pricing.countryPlaceholder")}
                        />
                      </div>
                      <div>
                        <Label htmlFor="reg-price">{t("products.workspace.pricing.localPrice")}</Label>
                        <Input
                          id="reg-price"
                          value={localPrice}
                          onChange={(e) => setLocalPrice(e.target.value)}
                          type="number"
                          min={0}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="rounded-xl"
                          disabled={!localPrice || commands.upsertRegionalPrice.isPending}
                          onClick={() => {
                            commands.upsertRegionalPrice.mutate({
                              productId: product.id,
                              localPrice: Number(localPrice),
                              country: country || null,
                            });
                            setLocalPrice("");
                            setCountry("");
                          }}
                        >
                          {t("products.workspace.pricing.addRegional")}
                        </Button>
                      </div>
                    </div>
                  </section>
                </TabsContent>

                <TabsContent value="availability" className="mt-0">
                  <EnterpriseEmptyState
                    compact
                    icon={<Package className="size-6" aria-hidden />}
                    title={t("products.workspace.availability.title")}
                    description={t("products.workspace.availability.body")}
                  />
                </TabsContent>

                <TabsContent value="documents" className="mt-0">
                  {product.documentUrls.length ? (
                    <ul className="space-y-2 text-[13px]">
                      {product.documentUrls.map((url) => (
                        <li key={url}>
                          <a href={url} className="text-primary underline" target="_blank" rel="noreferrer">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EnterpriseEmptyState
                      compact
                      icon={<Package className="size-6" aria-hidden />}
                      title={t("products.workspace.documents.emptyTitle")}
                      description={t("products.workspace.documents.emptyBody")}
                    />
                  )}
                </TabsContent>

                <TabsContent value="ai" className="mt-0 space-y-3">
                  {(
                    [
                      ["marketsTitle", "marketsBody"],
                      ["winRateTitle", "winRateBody"],
                      ["bundlesTitle", "bundlesBody"],
                    ] as const
                  ).map(([titleKey, bodyKey]) => (
                    <section key={titleKey} className="rounded-xl border border-border/60 p-4">
                      <h3 className="text-[13px] font-semibold">
                        {t(`products.workspace.ai.${titleKey}`)}
                      </h3>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {t(`products.workspace.ai.${bodyKey}`)}
                      </p>
                    </section>
                  ))}
                </TabsContent>

                <TabsContent value="audit" className="mt-0">
                  {(data?.history ?? []).length ? (
                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <table className="w-full min-w-[520px] text-start text-[13px] [&_td]:text-start [&_th]:text-start">
                        <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-semibold">
                              {t("products.workspace.audit.columns.actor")}
                            </th>
                            <th className="px-3 py-2 font-semibold">
                              {t("products.workspace.audit.columns.action")}
                            </th>
                            <th className="px-3 py-2 font-semibold">
                              {t("products.workspace.audit.columns.timestamp")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data!.history as ProductHistoryReadModel[]).map((item) => (
                            <tr key={item.id} className="border-b border-border/40">
                              <td className="px-3 py-2.5 align-middle">
                                <ProductAuditActor userId={item.actorUserId} />
                              </td>
                              <td className="px-3 py-2.5 align-middle">
                                <div className="font-medium">{historyEventLabel(t, item.eventType)}</div>
                                {item.fieldName ? (
                                  <div className="mt-1 text-[12px] text-muted-foreground">
                                    {item.fieldName}
                                    {item.previousValue || item.newValue
                                      ? ` · ${item.previousValue ?? "—"} → ${item.newValue ?? "—"}`
                                      : ""}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-muted-foreground">
                                <span className="inline-flex justify-start">
                                  <time
                                    dir="ltr"
                                    dateTime={item.createdAt}
                                    className="whitespace-nowrap tabular-nums"
                                  >
                                    {new Date(item.createdAt).toLocaleString(i18n.language)}
                                  </time>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EnterpriseEmptyState
                      compact
                      icon={<Package className="size-6" aria-hidden />}
                      title={t("products.workspace.audit.emptyTitle")}
                      description={t("products.workspace.audit.emptyBody")}
                    />
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>

    <DeleteDialog
      open={deleteOpen}
      onClose={() => setDeleteOpen(false)}
      isPending={commands.archive.isPending}
      title={t("products.workspace.deleteTitle")}
      description={t("products.workspace.deleteBody", { name: product?.name ?? "" })}
      onConfirm={() => {
        if (!product) return;
        commands.archive.mutate(
          { productId: product.id },
          {
            onSuccess: () => {
              setDeleteOpen(false);
              onOpenChange(false);
              toast({ title: t("products.workspace.deleted") });
            },
            onError: (error) => {
              toast({
                title: t("products.workspace.deleteFailed"),
                description: resolveApplicationErrorMessage(error),
                variant: "destructive",
              });
            },
          },
        );
      }}
    />
    </>
  );
}

export function OpportunityProductsPanel({
  opportunityId,
  currency,
  country,
  market,
}: {
  opportunityId: string;
  currency?: string | null;
  country?: string | null;
  market?: string | null;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canEdit = isSuperAdmin || hasPermission("opportunities.edit");
  const lines = useOpportunityLineItems(opportunityId);
  const catalog = useProductCatalog({ activeOnly: true });
  const commands = useProductCommands();
  const [pickerOpen, setPickerOpen] = useState(false);
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
    if (lines.isError && !loadErrorToasted.current) {
      loadErrorToasted.current = true;
      failToast("opportunities.products.loadError", lines.error);
    }
    if (!lines.isError) {
      loadErrorToasted.current = false;
    }
  }, [lines.isError, lines.error, failToast]);

  const lineItems = lines.data ?? [];
  const totals = lineItems.reduce(
    (acc, line) => ({
      subtotal: acc.subtotal + line.subtotal,
      tax: acc.tax + line.taxAmount,
      total: acc.total + line.total,
    }),
    { subtotal: 0, tax: 0, total: 0 },
  );

  if (lines.isLoading) {
    return <OpportunityProductsPanelSkeleton canEdit={canEdit} />;
  }

  if (lines.isError) {
    return (
      <EnterpriseEmptyState
        compact
        icon={<Package className="size-6" aria-hidden />}
        title={t("opportunities.products.loadError")}
        description={t("opportunities.products.loadErrorBody")}
        primaryAction={{
          label: t("buttons.refresh"),
          onClick: () => void lines.refetch(),
        }}
      />
    );
  }

  return (
    <div className="min-h-[220px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold">{t("opportunities.products.title")}</h3>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={commands.attachToOpportunity.isPending}
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-3.5" />
            {t("opportunities.products.add")}
          </Button>
        ) : null}
      </div>

      {lineItems.length === 0 ? (
        <EnterpriseEmptyState
          compact
          icon={<Package className="size-6" aria-hidden />}
          title={t("opportunities.products.emptyTitle")}
          description={t("opportunities.products.emptyBody")}
          primaryAction={
            canEdit
              ? {
                  label: t("opportunities.products.add"),
                  onClick: () => setPickerOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[640px] text-start text-[13px]">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.product")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.qty")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.unit")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.disc")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.tax")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.subtotal")}</th>
                <th className="px-3 py-2 text-start font-semibold">{t("opportunities.products.columns.total")}</th>
                {canEdit ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => (
                <tr key={line.id} className="border-b border-border/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{line.productName}</div>
                    <div className="text-[11px] text-muted-foreground">{line.sku}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {canEdit ? (
                      <OpportunityLineEditableNumber
                        className="h-8 w-20"
                        value={line.quantity}
                        disabled={commands.updateLine.isPending}
                        onSave={(qty) => {
                          commands.updateLine.mutate(
                            { opportunityId, lineId: line.id, quantity: qty },
                            {
                              onSuccess: () => successToast("opportunities.products.updateSuccess"),
                              onError: (error) =>
                                failToast("opportunities.products.updateFailed", error),
                            },
                          );
                        }}
                      />
                    ) : (
                      line.quantity
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {canEdit ? (
                      <OpportunityLineEditableNumber
                        className="h-8 w-24"
                        value={line.unitPrice}
                        disabled={commands.updateLine.isPending}
                        step="0.01"
                        onSave={(unitPrice) => {
                          commands.updateLine.mutate(
                            { opportunityId, lineId: line.id, unitPrice },
                            {
                              onSuccess: () => successToast("opportunities.products.updateSuccess"),
                              onError: (error) =>
                                failToast("opportunities.products.updateFailed", error),
                            },
                          );
                        }}
                      />
                    ) : (
                      opportunityMoney(line.unitPrice, currency)
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {canEdit ? (
                      <OpportunityLineEditableNumber
                        className="h-8 w-20"
                        value={line.discountPercent}
                        disabled={commands.updateLine.isPending}
                        min={0}
                        max={100}
                        onSave={(discountPercent) => {
                          commands.updateLine.mutate(
                            { opportunityId, lineId: line.id, discountPercent },
                            {
                              onSuccess: () => successToast("opportunities.products.updateSuccess"),
                              onError: (error) =>
                                failToast("opportunities.products.updateFailed", error),
                            },
                          );
                        }}
                      />
                    ) : (
                      line.discountPercent
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{line.taxPercent}</td>
                  <td className="px-3 py-2 tabular-nums">{opportunityMoney(line.subtotal, currency)}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{opportunityMoney(line.total, currency)}</td>
                  {canEdit ? (
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={commands.removeLine.isPending}
                        onClick={() => {
                          commands.removeLine.mutate(
                            { lineId: line.id },
                            {
                              onSuccess: () => successToast("opportunities.products.removeSuccess"),
                              onError: (error) =>
                                failToast("opportunities.products.removeFailed", error),
                            },
                          );
                        }}
                      >
                        {t("opportunities.products.columns.remove")}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 text-[13px]">
                <td colSpan={canEdit ? 5 : 5} className="px-3 py-2 text-end font-medium">
                  {t("opportunities.products.totals")}
                </td>
                <td className="px-3 py-2 tabular-nums">{opportunityMoney(totals.subtotal, currency)}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{opportunityMoney(totals.total, currency)}</td>
                {canEdit ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {canEdit ? (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-lg">
            <h3 className="text-[16px] font-semibold">{t("opportunities.products.selectProduct")}</h3>
            {catalog.isLoading ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : catalog.isError ? (
              <EnterpriseEmptyState
                compact
                title={t("opportunities.products.loadError")}
                description={t("opportunities.products.loadErrorBody")}
                primaryAction={{
                  label: t("buttons.refresh"),
                  onClick: () => void catalog.refetch(),
                }}
              />
            ) : (
              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
                {(catalog.data?.items ?? []).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border/50 px-3 py-2 text-start hover:bg-muted/40"
                    disabled={commands.attachToOpportunity.isPending}
                    onClick={() => {
                      commands.attachToOpportunity.mutate(
                        {
                          opportunityId,
                          productId: product.id,
                          country,
                          market,
                        },
                        {
                          onSuccess: () => {
                            successToast("opportunities.products.attachSuccess");
                            setPickerOpen(false);
                          },
                          onError: (error) =>
                            failToast("opportunities.products.attachFailed", error),
                        },
                      );
                    }}
                  >
                    <span>
                      <span className="block text-[13px] font-medium">{product.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {product.sku} · {product.productType}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {opportunityMoney(product.basePrice, currency)}
                    </span>
                  </button>
                ))}
                {!catalog.data?.items.length ? (
                  <p className="text-[13px] text-muted-foreground">{t("opportunities.products.noCatalog")}</p>
                ) : null}
              </div>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function OpportunityProductsPanelSkeleton({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="min-h-[220px] space-y-4" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-28" />
        {canEdit ? <Skeleton className="h-8 w-28" /> : null}
      </div>
      <Skeleton className="h-[180px] w-full rounded-lg" />
    </div>
  );
}
