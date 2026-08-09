import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatSalesMoney,
  localizeProductType,
} from "@/lib/sales/sales-localize";
import { cn } from "@/lib/utils";

const PRODUCT_TYPES = ["product", "service", "subscription", "bundle", "addon"] as const;

export function ProductsPage() {
  const { t, i18n } = useTranslation("common");
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("products.create");
  const catalog = useProductCatalog({ activeOnly: false });
  const categories = useProductCategories();
  const commands = useProductCommands();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [productType, setProductType] = useState<string>("product");
  const [basePrice, setBasePrice] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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
              <Button
                type="button"
                className="gap-2 rounded-xl"
                onClick={() => setCreateOpen(true)}
              >
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
                  onClick: () => setCreateOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-[13px]">
              <thead className="border-b border-border/40 bg-muted/20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t("products.columns.name")}</th>
                  <th className="px-4 py-3 font-semibold">{t("products.columns.sku")}</th>
                  <th className="px-4 py-3 font-semibold">{t("products.columns.type")}</th>
                  <th className="px-4 py-3 font-semibold">{t("products.columns.price")}</th>
                  <th className="px-4 py-3 font-semibold">{t("products.columns.status")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr
                    key={product.id}
                    className="cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/20"
                    onClick={() => setSelectedId(product.id)}
                  >
                    <td className="px-4 py-3 font-medium">{product.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{product.sku}</td>
                    <td className="px-4 py-3">{localizeProductType(t, product.productType)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatSalesMoney(product.basePrice, product.currency, i18n.language)}
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Product360Workspace
        productId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(next) => {
          if (!next) setSelectedId(null);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.create")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="p-name">{t("products.fields.name")}</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-sku">{t("products.fields.sku")}</Label>
              <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <Label>{t("products.fields.type")}</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
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
            <div>
              <Label htmlFor="p-price">{t("products.fields.basePrice")}</Label>
              <Input
                id="p-price"
                type="number"
                min={0}
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t("products.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || !sku.trim() || commands.create.isPending}
              onClick={() => {
                commands.create.mutate(
                  {
                    name: name.trim(),
                    sku: sku.trim(),
                    productType,
                    basePrice: basePrice ? Number(basePrice) : 0,
                  },
                  {
                    onSuccess: (product) => {
                      setCreateOpen(false);
                      setName("");
                      setSku("");
                      setBasePrice("");
                      setSelectedId(product.id);
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
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="c-name">{t("products.fields.categoryName")}</Label>
            <Input
              id="c-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
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
