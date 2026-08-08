import { Package, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogProductReadModel } from "@workspace/application-layer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnterpriseEmptyState } from "@/components/enterprise";
import {
  useOpportunityLineItems,
  useProduct360,
  useProductCatalog,
  useProductCommands,
} from "@/hooks/products/use-product-commands";
import { formatBillingCurrency } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

/** Company Settings currency (not per-record hardcoded codes). */
function money(value: number | null | undefined, _currency?: string) {
  return formatBillingCurrency(value);
}

function ProductHeader({
  product,
  onClose,
}: {
  product: CatalogProductReadModel;
  onClose: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent px-5 py-4 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="truncate text-[1.35rem] font-semibold tracking-[-0.03em]">{product.name}</h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold capitalize">
              {product.productType}
            </span>
            {!product.isActive ? (
              <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[12px] text-destructive">
                Inactive
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            SKU · {product.sku}
            {product.brand ? ` · ${product.brand}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
            <span className="font-semibold tabular-nums">
              {money(product.basePrice, product.currency)}
            </span>
            {product.marginPercent != null ? (
              <span className="text-muted-foreground">Margin · {product.marginPercent}%</span>
            ) : null}
            <span className="text-muted-foreground">Tax · {product.taxClass}</span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
    </header>
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
  const { t } = useTranslation("common");
  const { data, isLoading, isError, refetch } = useProduct360(productId);
  const commands = useProductCommands();
  const product = data?.product ?? null;
  const [country, setCountry] = useState("");
  const [localPrice, setLocalPrice] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(90vh,920px)] w-[min(1100px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0",
        )}
      >
        {isLoading ? (
          <div className="space-y-4 p-6" aria-busy="true">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError || !product ? (
          <div className="p-6">
            <EnterpriseEmptyState
              icon={<Package className="size-6" aria-hidden />}
              title={t("products.loadError", { defaultValue: "Could not load product" })}
              description={t("products.loadErrorBody", {
                defaultValue: "Check your connection and try again.",
              })}
              primaryAction={{
                label: t("common.retry", { defaultValue: "Retry" }),
                onClick: () => void refetch(),
              }}
            />
          </div>
        ) : (
          <>
            <ProductHeader product={product} onClose={() => onOpenChange(false)} />
            <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-5 mt-3 h-auto w-auto flex-wrap justify-start gap-1 bg-transparent p-0 sm:mx-7">
                {["overview", "pricing", "availability", "documents", "history", "ai", "audit"].map(
                  (value) => (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className="rounded-md px-3 py-1.5 text-[12px] capitalize data-[state=active]:bg-muted"
                    >
                      {value}
                    </TabsTrigger>
                  ),
                )}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
                <TabsContent value="overview" className="mt-0 space-y-4">
                  <p className="text-[14px] leading-relaxed text-muted-foreground">
                    {product.description || t("products.noDescription", { defaultValue: "No description." })}
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Type</dt>
                      <dd className="capitalize">{product.productType}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Unit</dt>
                      <dd>{product.unit}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Cost</dt>
                      <dd>{money(product.cost, product.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase text-muted-foreground">Inventory</dt>
                      <dd>
                        {product.trackInventory
                          ? `${product.stockQuantity ?? 0} ${product.unit}`
                          : "Not tracked"}
                      </dd>
                    </div>
                  </dl>
                  {product.tags.length ? (
                    <div className="flex flex-wrap gap-2">
                      {product.tags.map((tag) => (
                        <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-[12px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 space-y-4">
                  <section className="rounded-lg border border-border/60 p-4">
                    <h3 className="text-[12px] font-semibold uppercase text-muted-foreground">
                      Global price
                    </h3>
                    <p className="mt-2 text-[18px] font-semibold tabular-nums">
                      {money(product.basePrice, product.currency)}
                    </p>
                    {product.productType === "subscription" && product.subscriptionPrice != null ? (
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        Subscription · {money(product.subscriptionPrice, product.currency)} /{" "}
                        {product.subscriptionInterval}
                      </p>
                    ) : null}
                  </section>

                  <section className="space-y-3 rounded-lg border border-border/60 p-4">
                    <h3 className="text-[12px] font-semibold uppercase text-muted-foreground">
                      Regional prices
                    </h3>
                    {(data?.regional ?? []).length ? (
                      <ul className="space-y-2 text-[13px]">
                        {data!.regional.map((p) => (
                          <li key={p.id} className="flex justify-between gap-3">
                            <span>
                              {[p.country, p.market, p.region].filter(Boolean).join(" · ") || "Region"}
                            </span>
                            <span className="font-medium tabular-nums">
                              {money(p.localPrice, p.currencyOverride || product.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">No regional overrides yet.</p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div>
                        <Label htmlFor="reg-country">Country</Label>
                        <Input
                          id="reg-country"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          placeholder="SA"
                        />
                      </div>
                      <div>
                        <Label htmlFor="reg-price">Local price</Label>
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
                          Add regional
                        </Button>
                      </div>
                    </div>
                  </section>
                </TabsContent>

                <TabsContent value="availability" className="mt-0">
                  <EnterpriseEmptyState
                    compact
                    icon={<Package className="size-6" aria-hidden />}
                    title="Availability matrix"
                    description="Country and market availability is managed via regional pricing rows for Sprint 4.1."
                  />
                </TabsContent>

                <TabsContent value="documents" className="mt-0">
                  {product.documentUrls.length || product.imageUrls.length ? (
                    <ul className="space-y-2 text-[13px]">
                      {[...product.imageUrls, ...product.documentUrls].map((url) => (
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
                      title="No documents yet"
                      description="Attach product images and documents from catalog management later."
                    />
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  {(data?.history ?? []).length ? (
                    <ol className="space-y-3 border-s border-border/60 ps-4">
                      {data!.history.map((item) => (
                        <li key={item.id} className="relative">
                          <span className="absolute -start-[1.3rem] top-1.5 size-2 rounded-full bg-foreground/70" />
                          <div className="text-[13px] font-medium">{item.summary || item.eventType}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <EnterpriseEmptyState
                      compact
                      icon={<Package className="size-6" aria-hidden />}
                      title="No history yet"
                      description="Price and category changes appear here."
                    />
                  )}
                </TabsContent>

                <TabsContent value="ai" className="mt-0 space-y-3">
                  <section className="rounded-lg border border-dashed border-border/60 p-4">
                    <h3 className="text-[13px] font-semibold">Most sold markets</h3>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Placeholder — AI Deal Coach will populate this later.
                    </p>
                  </section>
                  <section className="rounded-lg border border-dashed border-border/60 p-4">
                    <h3 className="text-[13px] font-semibold">Typical win rate</h3>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Placeholder — requires closed-won opportunity analytics.
                    </p>
                  </section>
                  <section className="rounded-lg border border-dashed border-border/60 p-4">
                    <h3 className="text-[13px] font-semibold">Suggested bundles</h3>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Placeholder — bundle recommendations ship with AI Deal Coach.
                    </p>
                  </section>
                </TabsContent>

                <TabsContent value="audit" className="mt-0">
                  {(data?.history ?? []).length ? (
                    <ul className="space-y-2 text-[13px]">
                      {data!.history.map((item) => (
                        <li key={item.id} className="rounded-md border border-border/50 px-3 py-2">
                          <div className="font-medium">{item.eventType}</div>
                          <div className="text-muted-foreground">{item.summary}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">No audit entries.</p>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OpportunityProductsPanel({
  opportunityId,
  country,
  market,
}: {
  opportunityId: string;
  country?: string | null;
  market?: string | null;
}) {
  const { t } = useTranslation("common");
  const lines = useOpportunityLineItems(opportunityId);
  const catalog = useProductCatalog({ activeOnly: true });
  const commands = useProductCommands();
  const [pickerOpen, setPickerOpen] = useState(false);

  const totals = (lines.data ?? []).reduce(
    (acc, line) => ({
      subtotal: acc.subtotal + line.subtotal,
      tax: acc.tax + line.taxAmount,
      total: acc.total + line.total,
    }),
    { subtotal: 0, tax: 0, total: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold">
          {t("opportunities.products.title", { defaultValue: "Products" })}
        </h3>
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setPickerOpen(true)}>
          <Plus className="size-3.5" />
          {t("opportunities.products.add", { defaultValue: "Add product" })}
        </Button>
      </div>

      {(lines.data ?? []).length === 0 ? (
        <EnterpriseEmptyState
          compact
          icon={<Package className="size-6" aria-hidden />}
          title={t("opportunities.products.emptyTitle", { defaultValue: "No products attached" })}
          description={t("opportunities.products.emptyBody", {
            defaultValue: "Select catalog products to build the commercial scope of this opportunity.",
          })}
          primaryAction={{
            label: t("opportunities.products.add", { defaultValue: "Add product" }),
            onClick: () => setPickerOpen(true),
          }}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[640px] text-start text-[13px]">
            <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Product</th>
                <th className="px-3 py-2 font-semibold">Qty</th>
                <th className="px-3 py-2 font-semibold">Unit</th>
                <th className="px-3 py-2 font-semibold">Disc %</th>
                <th className="px-3 py-2 font-semibold">Tax %</th>
                <th className="px-3 py-2 font-semibold">Subtotal</th>
                <th className="px-3 py-2 font-semibold">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.data!.map((line) => (
                <tr key={line.id} className="border-b border-border/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{line.productName}</div>
                    <div className="text-[11px] text-muted-foreground">{line.sku}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2 tabular-nums">{money(line.unitPrice, line.currency)}</td>
                  <td className="px-3 py-2 tabular-nums">{line.discountPercent}</td>
                  <td className="px-3 py-2 tabular-nums">{line.taxPercent}</td>
                  <td className="px-3 py-2 tabular-nums">{money(line.subtotal, line.currency)}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">
                    {money(line.total, line.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => commands.removeLine.mutate({ lineId: line.id })}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 text-[13px]">
                <td colSpan={5} className="px-3 py-2 text-end font-medium">
                  Totals
                </td>
                <td className="px-3 py-2 tabular-nums">{money(totals.subtotal, "USD")}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{money(totals.total, "USD")}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <h3 className="text-[16px] font-semibold">Select product</h3>
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
            {(catalog.data?.items ?? []).map((product) => (
              <button
                key={product.id}
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-border/50 px-3 py-2 text-start hover:bg-muted/40"
                onClick={() => {
                  commands.attachToOpportunity.mutate(
                    {
                      opportunityId,
                      productId: product.id,
                      country,
                      market,
                    },
                    { onSuccess: () => setPickerOpen(false) },
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
                  {money(product.basePrice, product.currency)}
                </span>
              </button>
            ))}
            {!catalog.data?.items.length ? (
              <p className="text-[13px] text-muted-foreground">No active catalog products.</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
