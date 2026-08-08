import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus } from "lucide-react";
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

const PRODUCT_TYPES = ["product", "service", "subscription", "bundle", "addon"] as const;

export function ProductsPage() {
  const { t } = useTranslation("common");
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

  return (
    <div className="flex min-h-0 w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.25rem] font-semibold tracking-tight">
            {t("navigation.products", { defaultValue: "Products" })}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {t("products.subtitle", {
              defaultValue: "Reusable product & service catalog for sales execution.",
            })}
          </p>
        </div>
        {canCreate ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setCategoryOpen(true)}>
              {t("products.addCategory", { defaultValue: "Add category" })}
            </Button>
            <Button type="button" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("products.create", { defaultValue: "New product" })}
            </Button>
          </div>
        ) : null}
      </div>

      {(categories.data ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {categories.data!.map((cat) => (
            <span
              key={cat.id}
              className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 text-[12px]"
            >
              {cat.parentId ? "↳ " : ""}
              {cat.name}
            </span>
          ))}
        </div>
      ) : null}

      {catalog.isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : !catalog.data?.items.length ? (
        <EnterpriseEmptyState
          icon={<Package className="size-6" aria-hidden />}
          title={t("products.emptyTitle", { defaultValue: "Catalog is empty" })}
          description={t("products.emptyBody", {
            defaultValue: "Create products, services, subscriptions, bundles, and add-ons once.",
          })}
          primaryAction={
            canCreate
              ? {
                  label: t("products.create", { defaultValue: "New product" }),
                  onClick: () => setCreateOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[720px] text-start text-[13px]">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">SKU</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Price</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {catalog.data.items.map((product) => (
                <tr
                  key={product.id}
                  className="cursor-pointer border-b border-border/40 hover:bg-muted/20"
                  onClick={() => setSelectedId(product.id)}
                >
                  <td className="px-3 py-2.5 font-medium">{product.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{product.sku}</td>
                  <td className="px-3 py-2.5 capitalize">{product.productType}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {product.basePrice} {product.currency}
                  </td>
                  <td className="px-3 py-2.5">{product.isActive ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Product360Workspace
        productId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.create", { defaultValue: "New product" })}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="p-sku">SKU</Label>
              <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="p-price">Base price</Label>
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
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("products.addCategory", { defaultValue: "Add category" })}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
          </div>
          <DialogFooter>
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
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
