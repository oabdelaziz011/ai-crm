import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const PRODUCT_TYPES = ["product", "service", "subscription", "bundle", "addon"] as const;
const CURRENCIES = ["EGP", "USD", "SAR", "AED", "EUR"] as const;

const TABLE_COLS =
  "md:grid-cols-[minmax(0,2.2fr)_110px_minmax(0,1fr)_100px_120px_88px]";

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

type CreateFormState = {
  name: string;
  sku: string;
  productType: string;
  categoryId: string;
  basePrice: string;
  currency: string;
  description: string;
  brand: string;
  cost: string;
};

const EMPTY_CREATE: CreateFormState = {
  name: "",
  sku: "",
  productType: "product",
  categoryId: "",
  basePrice: "",
  currency: "EGP",
  description: "",
  brand: "",
  cost: "",
};

export function ProductsPage() {
  const { t, i18n } = useTranslation("common");
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("products.create");
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
      return next;
    });
  };

  const canSubmitCreate =
    Boolean(form.name.trim()) &&
    Boolean(form.sku.trim()) &&
    form.basePrice.trim() !== "" &&
    Number(form.basePrice) >= 0 &&
    !commands.create.isPending;

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
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
          <div
            className={cn(
              "hidden gap-3 border-b border-border/40 bg-muted/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:grid",
              TABLE_COLS,
            )}
          >
            <span className="text-start">{t("products.columns.name")}</span>
            <span className="text-start">{t("products.columns.sku")}</span>
            <span className="text-start">{t("products.columns.category")}</span>
            <span className="text-start">{t("products.columns.type")}</span>
            <span className="text-end">{t("products.columns.price")}</span>
            <span className="text-start">{t("products.columns.status")}</span>
          </div>
          <ul className="divide-y divide-border/40">
            {items.map((product) => {
              const categoryLabel = product.categoryId
                ? categoryNameById.get(product.categoryId)
                : null;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    className={cn(
                      "grid w-full gap-2 px-4 py-3.5 text-start transition-colors hover:bg-muted/25",
                      "grid-cols-1",
                      TABLE_COLS,
                      "md:items-center md:gap-3",
                    )}
                    onClick={() => setSelectedId(product.id)}
                  >
                    <div className="min-w-0">
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
                    </div>
                    <p className="hidden truncate font-mono text-[12px] text-muted-foreground md:block">
                      {product.sku}
                    </p>
                    <p className="truncate text-[13px] text-foreground/90">
                      {categoryLabel || t("products.columns.uncategorized")}
                    </p>
                    <p className="text-[13px]">{localizeProductType(t, product.productType)}</p>
                    <p className="text-[13px] font-medium tabular-nums md:text-end">
                      {formatSalesMoney(product.basePrice, product.currency, i18n.language)}
                    </p>
                    <div>
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
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("products.create")}</DialogTitle>
            <DialogDescription>{t("products.createHint")}</DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[min(70vh,560px)] gap-4 overflow-y-auto py-1 pe-1">
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
                  <Label htmlFor="p-desc">{t("products.fields.description")}</Label>
                  <Textarea
                    id="p-desc"
                    value={form.description}
                    onChange={(e) => patchForm("description", e.target.value)}
                    placeholder={t("products.placeholders.description")}
                    className="mt-1.5 min-h-[72px] resize-none"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("products.sections.commercial")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="p-price">{t("products.fields.basePrice")}</Label>
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t("products.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!canSubmitCreate}
              onClick={() => {
                commands.create.mutate(
                  {
                    name: form.name.trim(),
                    sku: form.sku.trim(),
                    productType: form.productType,
                    categoryId: form.categoryId || null,
                    description: form.description.trim() || undefined,
                    brand: form.brand.trim() || undefined,
                    basePrice: Number(form.basePrice),
                    currency: form.currency,
                    cost: form.cost.trim() === "" ? null : Number(form.cost),
                  },
                  {
                    onSuccess: (product) => {
                      setCreateOpen(false);
                      setForm(EMPTY_CREATE);
                      toast({ title: t("products.createSuccess") });
                      setSelectedId(product.id);
                    },
                    onError: (error) => {
                      toast({
                        title: t("products.createFailed"),
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
