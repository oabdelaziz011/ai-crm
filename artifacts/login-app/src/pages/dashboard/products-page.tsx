import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { LayoutGrid, List, Package, Plus, Search } from "lucide-react";
import { useProductAliasPreview } from "@/hooks/products/use-product-alias-preview";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Product360Workspace } from "@/components/products/product360-workspace";
import { ProductDescriptionEditor } from "@/components/products/product-description-editor";
import { ProductImageEditor } from "@/components/products/product-image-editor";
import { ProductImageStage } from "@/components/products/product-image-stage";
import {
  useProductCatalog,
  useProductCategories,
  useProductCommands,
} from "@/hooks/products/use-product-commands";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import {
  formatSalesMoney,
  localizeProductType,
} from "@/lib/sales/sales-localize";
import { cn } from "@/lib/utils";
import {
  PRODUCT_TYPES,
  catalogCustomerUnitPrice,
  parseTaxPercentInput,
  type ProductPriceTaxMode,
} from "@workspace/product-platform";
import { PRODUCT_UNITS } from "@/lib/product-platform/product-units";
import { ProductTaxFields } from "@/components/products/product-tax-fields";
import {
  ProductAliasesField,
  aliasesTextToList,
} from "@/components/products/product-aliases-field";

const CURRENCIES = ["EGP", "USD", "SAR", "AED", "EUR"] as const;
const BILLING_INTERVALS = ["month", "year", "quarter"] as const;
type BillingInterval = (typeof BILLING_INTERVALS)[number];
type BillingMode = "one_time" | BillingInterval;

const PRODUCT_VIEW_KEY = "valueor.products.view";

function readProductView(): "table" | "grid" {
  try {
    return window.localStorage.getItem(PRODUCT_VIEW_KEY) === "grid" ? "grid" : "table";
  } catch {
    return "table";
  }
}

function suggestSku(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
  const suffix = Date.now().toString(36).toUpperCase().slice(-4);
  return slug ? `${slug}-${suffix}` : `PRD-${suffix}`;
}

function supportsBilling(productType: string): boolean {
  return productType === "service" || productType === "subscription";
}

type CreateFormState = {
  name: string;
  sku: string;
  productType: string;
  categoryId: string;
  basePrice: string;
  currency: string;
  priceTaxMode: ProductPriceTaxMode;
  taxPercent: string;
  billingMode: BillingMode;
  description: string;
  brand: string;
  cost: string;
  unit: string;
  trackInventory: boolean;
  stockQuantity: string;
  aliasesText: string;
  imageUrls: string[];
};

const EMPTY_CREATE: CreateFormState = {
  name: "",
  sku: "",
  productType: "product",
  categoryId: "",
  basePrice: "",
  currency: "EGP",
  priceTaxMode: "inclusive",
  taxPercent: "",
  billingMode: "one_time",
  description: "",
  brand: "",
  cost: "",
  unit: "each",
  trackInventory: false,
  stockQuantity: "",
  aliasesText: "",
  imageUrls: [],
};

export function ProductsPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("products.create");
  const canEdit = isSuperAdmin || hasPermission("products.edit");
  const catalog = useProductCatalog({ activeOnly: false });
  const categories = useProductCategories();
  const commands = useProductCommands();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_CREATE);
  const [categoryName, setCategoryName] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"table" | "grid">(readProductView);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const formatCatalogPrice = (product: {
    basePrice: number;
    currency: string;
    subscriptionInterval: string | null;
    subscriptionPrice: number | null;
    priceTaxMode?: ProductPriceTaxMode;
    taxPercent?: number;
  }) => {
    const money = formatSalesMoney(
      catalogCustomerUnitPrice(product),
      product.currency,
      i18n.language,
    );
    if (product.subscriptionPrice != null && product.subscriptionInterval) {
      return t("products.billing.pricePer", {
        price: money,
        interval: t(`products.billing.intervals.${product.subscriptionInterval}`, {
          defaultValue: product.subscriptionInterval,
        }),
      });
    }
    return money;
  };

  const setProductActive = (productId: string, isActive: boolean) => {
    if (!canEdit || togglingId) return;
    setTogglingId(productId);
    commands.update.mutate(
      { productId, patch: { isActive } },
      {
        onSuccess: () => {
          toast({
            title: isActive ? t("products.toggle.on") : t("products.toggle.off"),
          });
        },
        onError: (error) => {
          toast({
            title: t("products.toggle.failed"),
            description: resolveApplicationErrorMessage(error),
            variant: "destructive",
          });
        },
        onSettled: () => setTogglingId(null),
      },
    );
  };

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories.data ?? []) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories.data]);

  const items = useMemo(() => {
    const rows = catalog.data?.items ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((product) => {
      if (typeFilter !== "all" && product.productType !== typeFilter) return false;
      if (statusFilter === "active" && !product.isActive) return false;
      if (statusFilter === "inactive" && product.isActive) return false;
      if (!q) return true;
      return (
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        product.brand?.toLowerCase().includes(q)
      );
    });
  }, [catalog.data?.items, search, statusFilter, typeFilter]);

  const openCreate = () => {
    setForm({
      ...EMPTY_CREATE,
      sku: suggestSku(""),
    });
    setCreateOpen(true);
  };

  const patchForm = <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !prev.sku.trim()) {
        next.sku = suggestSku(String(value));
      }
      if (key === "productType") {
        const type = String(value);
        if (type === "subscription") next.billingMode = "month";
        else if (!supportsBilling(type)) next.billingMode = "one_time";
        else if (prev.billingMode === "one_time" && type === "service") next.billingMode = "one_time";
      }
      return next;
    });
  };

  const parsedTaxPercent = parseTaxPercentInput(form.taxPercent.trim() === "" ? 0 : form.taxPercent);
  const selectedCategoryName =
    categories.data?.find((category) => category.id === form.categoryId)?.name ?? null;
  const aliasPreview = useProductAliasPreview({
    enabled: createOpen,
    name: form.name,
    description: form.description,
    productType: form.productType,
    brand: form.brand,
    categoryName: selectedCategoryName,
    aliasesText: form.aliasesText,
    onAliasesGenerated: (aliasesText) => patchForm("aliasesText", aliasesText),
  });
  const aliasPreviewStatus =
    aliasPreview.status === "pending"
      ? "pending"
      : aliasPreview.status === "ready"
        ? "completed"
        : aliasPreview.status === "failed"
          ? "failed"
          : null;
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const canSubmitCreate =
    Boolean(form.name.trim()) &&
    Boolean(form.sku.trim()) &&
    form.basePrice.trim() !== "" &&
    Number(form.basePrice) >= 0 &&
    parsedTaxPercent != null &&
    !commands.create.isPending &&
    !createSubmitting;

  return (
    <div className="flex min-h-0 w-full flex-col gap-5" dir={i18n.dir()}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.35rem] font-semibold tracking-tight">
            {t("navigation.products")}
          </h1>
          <p className="max-w-2xl text-[13px] text-muted-foreground">{t("products.subtitle")}</p>
          <p className="text-[12px] text-muted-foreground/90">{t("products.integrationHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl">
            <Link href="~/dashboard/opportunities">{t("products.openOpportunities")}</Link>
          </Button>
          {canCreate ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setCategoryOpen(true)}
              >
                {t("products.addCategory")}
              </Button>
              <Button type="button" className="gap-2 rounded-xl" onClick={openCreate}>
                <Plus className="size-4" aria-hidden />
                {t("products.create")}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("products.searchPlaceholder")}
            className="h-10 rounded-xl ps-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-10 w-[160px] rounded-xl">
            <SelectValue placeholder={t("products.filter.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("products.filter.allTypes")}</SelectItem>
            {PRODUCT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {localizeProductType(t, type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 w-[160px] rounded-xl">
            <SelectValue placeholder={t("products.filter.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("products.filter.allStatus")}</SelectItem>
            <SelectItem value="active">{t("products.status.active")}</SelectItem>
            <SelectItem value="inactive">{t("products.status.inactive")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-xl border border-border/60 p-0.5">
          <Button
            type="button"
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            className="h-9 gap-1.5 rounded-lg px-2.5"
            aria-pressed={view === "table"}
            onClick={() => {
              setView("table");
              window.localStorage.setItem(PRODUCT_VIEW_KEY, "table");
            }}
          >
            <List className="size-4" aria-hidden />
            <span>{t("products.view.list")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            className="h-9 gap-1.5 rounded-lg px-2.5"
            aria-pressed={view === "grid"}
            onClick={() => {
              setView("grid");
              window.localStorage.setItem(PRODUCT_VIEW_KEY, "grid");
            }}
          >
            <LayoutGrid className="size-4" aria-hidden />
            <span>{t("products.view.grid")}</span>
          </Button>
        </div>
      </div>

      {(categories.data ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {categories.data!.map((cat) => (
            <span
              key={cat.id}
              className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1 text-[12px] font-medium"
            >
              {cat.parentId ? "↳ " : ""}
              {cat.name}
            </span>
          ))}
        </div>
      ) : null}

      {catalog.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EnterpriseEmptyState
          icon={<Package className="size-6" aria-hidden />}
          title={t("products.emptyTitle")}
          description={t("products.emptyBody")}
          primaryAction={
            canCreate
              ? {
                  label: t("products.create"),
                  onClick: openCreate,
                }
              : undefined
          }
        />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((product) => (
            <li key={product.id}>
              <div
                className={cn(
                  "relative flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                  !product.isActive && "opacity-70",
                )}
              >
                <button
                  type="button"
                  className="flex w-full flex-col text-start"
                  onClick={() => setSelectedId(product.id)}
                >
                  <ProductImageStage images={product.imageUrls} alt={product.name} className="aspect-square" />
                  <span className="space-y-1 p-3 pe-14">
                    <span className="line-clamp-2 block text-[14px] font-semibold tracking-tight">{product.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{product.sku}</span>
                    <span className="block text-[13px] font-medium tabular-nums">
                      {formatCatalogPrice(product)}
                    </span>
                  </span>
                </button>
                {canEdit ? (
                  <div
                    className="absolute end-2 top-2 rounded-full border border-border/50 bg-background/90 p-1.5 shadow-sm backdrop-blur"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Switch
                      checked={product.isActive}
                      disabled={togglingId === product.id || commands.update.isPending}
                      onCheckedChange={(checked) => setProductActive(product.id, checked)}
                      aria-label={t("products.toggle.label")}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/50 bg-card/40 shadow-sm">
          <table className="w-full table-fixed text-start text-[13px]">
            <thead className="border-b border-border/40 bg-muted/20 text-[11px] text-muted-foreground">
              <tr>
                <th className="w-[28%] px-4 py-2.5 text-start font-semibold">
                  {t("products.columns.name")}
                </th>
                <th className="hidden w-[14%] px-4 py-2.5 text-start font-semibold md:table-cell">
                  {t("products.columns.sku")}
                </th>
                <th className="hidden w-[16%] px-4 py-2.5 text-start font-semibold md:table-cell">
                  {t("products.columns.category")}
                </th>
                <th className="hidden w-[12%] px-4 py-2.5 text-start font-semibold md:table-cell">
                  {t("products.columns.type")}
                </th>
                <th className="w-[16%] px-4 py-2.5 text-start font-semibold">
                  {t("products.columns.price")}
                </th>
                <th className="w-[14%] px-4 py-2.5 text-start font-semibold">
                  {t("products.columns.status")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((product) => {
                const categoryLabel = product.categoryId
                  ? categoryNameById.get(product.categoryId)
                  : null;
                return (
                  <tr
                    key={product.id}
                    tabIndex={0}
                    className="cursor-pointer hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setSelectedId(product.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(product.id);
                      }
                    }}
                  >
                    <td className="px-4 py-3.5 align-middle">
                      <p className="truncate text-[14px] font-semibold tracking-tight">
                        {product.name}
                      </p>
                      {product.brand ? (
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {product.brand}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[12px] text-muted-foreground md:hidden">
                          {product.sku}
                        </p>
                      )}
                    </td>
                    <td className="hidden truncate px-4 py-3.5 align-middle font-mono text-[12px] text-muted-foreground md:table-cell">
                      {product.sku}
                    </td>
                    <td className="hidden truncate px-4 py-3.5 align-middle text-foreground/90 md:table-cell">
                      {categoryLabel || t("products.columns.uncategorized")}
                    </td>
                    <td className="hidden px-4 py-3.5 align-middle md:table-cell">
                      {localizeProductType(t, product.productType)}
                    </td>
                    <td className="px-4 py-3.5 align-middle font-medium tabular-nums">
                      {formatCatalogPrice(product)}
                    </td>
                    <td
                      className="px-4 py-3.5 align-middle"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {canEdit ? (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={product.isActive}
                            disabled={togglingId === product.id || commands.update.isPending}
                            onCheckedChange={(checked) => setProductActive(product.id, checked)}
                            aria-label={t("products.toggle.label")}
                          />
                          <span
                            className={cn(
                              "text-[11px] font-semibold",
                              product.isActive
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-muted-foreground",
                            )}
                          >
                            {product.isActive
                              ? t("products.status.active")
                              : t("products.status.inactive")}
                          </span>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold",
                            product.isActive
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {product.isActive
                            ? t("products.status.active")
                            : t("products.status.inactive")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Product360Workspace
        productId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null);
        }}
      />

      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) setForm(EMPTY_CREATE);
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("products.create")}</DialogTitle>
            <DialogDescription>{t("products.createHint")}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-1 pe-1">
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("products.sections.identity")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="p-name">{t("products.fields.name")}</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => patchForm("name", e.target.value)}
                    placeholder={t("products.placeholders.name")}
                    className="mt-1.5"
                    autoFocus
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="p-sku">{t("products.fields.sku")}</Label>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary hover:underline"
                      onClick={() => patchForm("sku", suggestSku(form.name))}
                    >
                      {t("products.actions.generateSku")}
                    </button>
                  </div>
                  <Input
                    id="p-sku"
                    value={form.sku}
                    onChange={(e) => patchForm("sku", e.target.value)}
                    placeholder={t("products.placeholders.sku")}
                    className="mt-1.5 font-mono text-[13px]"
                  />
                </div>
                <div>
                  <Label>{t("products.fields.type")}</Label>
                  <Select
                    value={form.productType}
                    onValueChange={(value) => patchForm("productType", value)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {localizeProductType(t, type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>{t("products.fields.category")}</Label>
                  <Select
                    value={form.categoryId || "none"}
                    onValueChange={(value) =>
                      patchForm("categoryId", value === "none" ? "" : value)
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder={t("products.placeholders.category")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("products.placeholders.category")}</SelectItem>
                      {(categories.data ?? []).map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.parentId ? `↳ ${cat.name}` : cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <ProductDescriptionEditor
                    id="p-desc"
                    value={form.description}
                    onChange={(next) => patchForm("description", next)}
                    placeholder={t("products.placeholders.description")}
                    rows={6}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("products.sections.commercial")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {supportsBilling(form.productType) ? (
                  <div className="sm:col-span-2 space-y-3 rounded-xl border border-border/50 bg-muted/15 p-3">
                    <div>
                      <p className="text-[12px] font-semibold">{t("products.sections.billing")}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{t("products.billing.hint")}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>{t("products.billing.mode")}</Label>
                        <Select
                          value={form.billingMode === "one_time" ? "one_time" : "recurring"}
                          onValueChange={(value) =>
                            patchForm(
                              "billingMode",
                              value === "one_time"
                                ? "one_time"
                                : form.billingMode === "one_time"
                                  ? "month"
                                  : form.billingMode,
                            )
                          }
                        >
                          <SelectTrigger className="mt-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one_time">{t("products.billing.oneTime")}</SelectItem>
                            <SelectItem value="recurring">{t("products.billing.recurring")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.billingMode !== "one_time" ? (
                        <div>
                          <Label>{t("products.billing.interval")}</Label>
                          <Select
                            value={form.billingMode}
                            onValueChange={(value) => patchForm("billingMode", value as BillingInterval)}
                          >
                            <SelectTrigger className="mt-1.5">
                              <SelectValue />
                            </SelectTrigger>
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
                  <Label htmlFor="p-price">
                    {form.billingMode !== "one_time" && supportsBilling(form.productType)
                      ? t("products.billing.subscriptionPrice")
                      : t("products.fields.basePrice")}
                  </Label>
                  <Input
                    id="p-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.basePrice}
                    onChange={(e) => patchForm("basePrice", e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>{t("products.fields.currency")}</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(value) => patchForm("currency", value)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ProductTaxFields
                  enteredPrice={form.basePrice}
                  currency={form.currency}
                  taxMode={form.priceTaxMode}
                  taxPercent={form.taxPercent}
                  onTaxModeChange={(value) => patchForm("priceTaxMode", value)}
                  onTaxPercentChange={(value) => patchForm("taxPercent", value)}
                />
                <div>
                  <Label htmlFor="p-brand">{t("products.fields.brand")}</Label>
                  <Input
                    id="p-brand"
                    value={form.brand}
                    onChange={(e) => patchForm("brand", e.target.value)}
                    placeholder={t("products.placeholders.brand")}
                    className="mt-1.5"
                  />
                </div>
                <ProductAliasesField
                  id="p-aliases"
                  value={form.aliasesText}
                  onChange={(value) => patchForm("aliasesText", value)}
                  disabled={commands.create.isPending || createSubmitting || aliasPreview.status === "pending"}
                  createMode
                  generationStatus={aliasPreviewStatus}
                />
                <div>
                  <Label htmlFor="p-cost">{t("products.fields.cost")}</Label>
                  <Input
                    id="p-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => patchForm("cost", e.target.value)}
                    placeholder={t("products.placeholders.cost")}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("products.hints.cost")}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("products.sections.inventory")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t("products.fields.unit")}</Label>
                  <Select
                    value={form.unit}
                    onValueChange={(value) => patchForm("unit", value)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_UNITS.map((code) => (
                        <SelectItem key={code} value={code}>
                          {t(`products.workspace.units.${code}`, { defaultValue: code })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("products.fields.trackInventory")}</Label>
                  <Select
                    value={form.trackInventory ? "yes" : "no"}
                    onValueChange={(value) => patchForm("trackInventory", value === "yes")}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">{t("products.inventory.notTracked")}</SelectItem>
                      <SelectItem value="yes">{t("products.inventory.tracked")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.trackInventory ? (
                  <div>
                    <Label htmlFor="p-stock">{t("products.fields.stockQuantity")}</Label>
                    <Input
                      id="p-stock"
                      type="number"
                      min={0}
                      step="1"
                      value={form.stockQuantity}
                      onChange={(e) => patchForm("stockQuantity", e.target.value)}
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("products.hints.inventory")}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
            <ProductImageEditor
              urls={form.imageUrls}
              disabled={commands.create.isPending}
              onChange={(imageUrls) => patchForm("imageUrls", imageUrls)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t("products.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!canSubmitCreate}
              onClick={() => {
                void (async () => {
                  setCreateSubmitting(true);
                  try {
                    let aliases = aliasesTextToList(form.aliasesText);
                    if (aliases.length === 0 && form.name.trim().length >= 3) {
                      aliases = await aliasPreview.generateNow();
                    }
                    const amount = Number(form.basePrice);
                    const recurring =
                      supportsBilling(form.productType) && form.billingMode !== "one_time"
                        ? (form.billingMode as BillingInterval)
                        : null;
                    const product = await commands.create.mutateAsync({
                      name: form.name.trim(),
                      sku: form.sku.trim(),
                      productType: form.productType,
                      categoryId: form.categoryId || null,
                      description: form.description.trim() || undefined,
                      brand: form.brand.trim() || undefined,
                      basePrice: amount,
                      currency: form.currency,
                      priceTaxMode: form.priceTaxMode,
                      taxPercent: parsedTaxPercent ?? 0,
                      cost: form.cost.trim() === "" ? null : Number(form.cost),
                      subscriptionInterval: recurring,
                      subscriptionPrice: recurring ? amount : null,
                      unit: form.unit,
                      trackInventory: form.trackInventory,
                      stockQuantity: form.trackInventory
                        ? form.stockQuantity.trim() === ""
                          ? 0
                          : Number(form.stockQuantity)
                        : null,
                      aliases,
                      imageUrls: form.imageUrls,
                    });
                    setCreateOpen(false);
                    setForm(EMPTY_CREATE);
                    toast({ title: t("products.createSuccess") });
                    setSelectedId(product.id);
                  } catch (error) {
                    toast({
                      title: t("products.createFailed"),
                      description: resolveApplicationErrorMessage(error),
                      variant: "destructive",
                    });
                  } finally {
                    setCreateSubmitting(false);
                  }
                })();
              }}
            >
              {t("products.createAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.addCategory")}</DialogTitle>
            <DialogDescription>{t("products.categoryHint")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="c-name">{t("products.fields.categoryName")}</Label>
            <Input
              id="c-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="mt-1.5"
              placeholder={t("products.placeholders.categoryName")}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCategoryOpen(false)}>
              {t("products.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!categoryName.trim() || commands.createCategory.isPending}
              onClick={() => {
                commands.createCategory.mutate(
                  { name: categoryName.trim() },
                  {
                    onSuccess: () => {
                      setCategoryOpen(false);
                      setCategoryName("");
                      toast({ title: t("products.categorySuccess") });
                    },
                    onError: (error) => {
                      toast({
                        title: t("products.categoryFailed"),
                        description: resolveApplicationErrorMessage(error),
                        variant: "destructive",
                      });
                    },
                  },
                );
              }}
            >
              {t("products.createAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
