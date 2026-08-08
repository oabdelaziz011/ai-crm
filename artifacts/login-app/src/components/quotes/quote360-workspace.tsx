import {
  Check,
  FileText,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { QuoteLineItemReadModel, QuoteReadModel } from "@workspace/application-layer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { useProductCatalog } from "@/hooks/products/use-product-commands";
import {
  useOpportunityQuotes,
  useQuote360,
  useQuoteCommands,
} from "@/hooks/quotes/use-quote-commands";
import { formatBillingCurrency } from "@/lib/billing/format";
import { cn } from "@/lib/utils";

/** Company Settings currency (not per-record hardcoded codes). */
function money(value: number | null | undefined, _currency?: string) {
  return formatBillingCurrency(value);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold capitalize tracking-wide">
      {status.replaceAll("_", " ")}
    </span>
  );
}

function StickyTotals({ quote }: { quote: QuoteReadModel }) {
  const rows = [
    ["Subtotal", quote.subtotal],
    ["Discount", quote.discountTotal],
    ["Tax", quote.taxTotal],
    ["Shipping", quote.shippingTotal],
  ] as const;

  return (
    <aside className="sticky top-0 flex w-full shrink-0 flex-col gap-3 border-l border-border/60 bg-muted/20 p-5 lg:w-[280px]">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Totals
      </h3>
      <dl className="space-y-2 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums font-medium">{money(value, quote.currency)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <dt className="font-semibold">Grand Total</dt>
          <dd className="text-[15px] font-semibold tabular-nums">
            {money(quote.grandTotal, quote.currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Weighted Revenue</dt>
          <dd className="tabular-nums">{money(quote.weightedRevenue, quote.currency)}</dd>
        </div>
      </dl>
    </aside>
  );
}

function PricingTable({
  lines,
  currency,
  editable,
  onUpdate,
  onRemove,
}: {
  lines: readonly QuoteLineItemReadModel[];
  currency: string;
  editable: boolean;
  onUpdate: (lineId: string, patch: { quantity?: number; unitPrice?: number; discountPercent?: number; taxPercent?: number }) => void;
  onRemove: (lineId: string) => void;
}) {
  if (!lines.length) {
    return (
      <EnterpriseEmptyState
        icon={<FileText className="size-6" aria-hidden />}
        title="No line items"
        description="Add products from the catalog. Regional pricing resolves automatically."
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
            <th className="px-3 py-2.5 font-semibold">Unit</th>
            <th className="px-3 py-2.5 font-semibold">Disc %</th>
            <th className="px-3 py-2.5 font-semibold">Tax %</th>
            <th className="px-3 py-2.5 font-semibold text-right">Total</th>
            {editable ? <th className="px-3 py-2.5" /> : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-border/50">
              <td className="px-3 py-2.5">
                <div className="font-medium">{line.productName || line.sectionTitle || line.lineKind}</div>
                {line.sku ? <div className="text-muted-foreground">SKU · {line.sku}</div> : null}
              </td>
              <td className="px-3 py-2.5">
                {editable && !["section", "note"].includes(line.lineKind) ? (
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
              <td className="px-3 py-2.5 tabular-nums">{money(line.unitPrice, currency)}</td>
              <td className="px-3 py-2.5 tabular-nums">{line.discountPercent}</td>
              <td className="px-3 py-2.5 tabular-nums">{line.taxPercent}</td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                {money(line.total, currency)}
              </td>
              {editable ? (
                <td className="px-3 py-2.5 text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.id)}>
                    Remove
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteHeader({
  quote,
  onClose,
  actions,
}: {
  quote: QuoteReadModel;
  onClose: () => void;
  actions: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-border/60 bg-gradient-to-b from-muted/30 to-transparent px-5 py-4 sm:px-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="truncate text-[1.35rem] font-semibold tracking-[-0.03em]">
              {quote.title || quote.quoteNumber}
            </h2>
            <StatusBadge status={quote.status} />
            <span className="rounded-md border border-border/70 px-2 py-0.5 text-[12px] font-semibold">
              v{quote.versionNumber}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {quote.quoteNumber}
            {quote.contactName ? ` · ${quote.contactName}` : ""}
            {quote.validUntil ? ` · Valid until ${quote.validUntil}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </div>
    </header>
  );
}

export function Quote360Workspace({
  quoteId,
  open,
  onOpenChange,
  onVersionCreated,
}: {
  quoteId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionCreated?: (quoteId: string) => void;
}) {
  const { t } = useTranslation("common");
  const { data, isLoading, isError, refetch } = useQuote360(quoteId);
  const commands = useQuoteCommands();
  const catalog = useProductCatalog({ activeOnly: true });
  const [productQuery, setProductQuery] = useState("");
  const quote = data?.quote ?? null;
  const editable = quote ? ["draft", "internal_review"].includes(quote.status) : false;

  const filteredProducts = useMemo(() => {
    const items = catalog.data?.items ?? [];
    const q = productQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 8);
  }, [catalog.data?.items, productQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(92vh,960px)] w-[min(1280px,98vw)] max-w-none flex-col gap-0 overflow-hidden p-0",
        )}
      >
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
              onClose={() => onOpenChange(false)}
              actions={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={commands.createVersion.isPending}
                    onClick={() => {
                      void commands.createVersion.mutateAsync(quote.id).then((next) => {
                        onVersionCreated?.(next.id);
                      });
                    }}
                  >
                    New version
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={commands.requestApproval.isPending}
                    onClick={() => void commands.requestApproval.mutateAsync(quote.id)}
                  >
                    <ShieldCheck className="mr-1.5 size-3.5" />
                    Request approval
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={commands.changeStatus.isPending || quote.status === "sent"}
                    onClick={() =>
                      void commands.changeStatus.mutateAsync({ quoteId: quote.id, status: "sent" })
                    }
                  >
                    <Send className="mr-1.5 size-3.5" />
                    Send
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void commands.changeStatus.mutateAsync({ quoteId: quote.id, status: "accepted" })
                    }
                  >
                    <Check className="mr-1.5 size-3.5" />
                    Accept
                  </Button>
                </>
              }
            />

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <Tabs defaultValue="overview" className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="shrink-0 overflow-x-auto border-b border-border/60 px-5 sm:px-7">
                  <TabsList className="h-auto w-max justify-start gap-1 bg-transparent p-0 py-2">
                    {(
                      [
                        "overview",
                        "products",
                        "pricing",
                        "timeline",
                        "activities",
                        "files",
                        "ai",
                        "audit",
                        "approvals",
                      ] as const
                    ).map((tab) => (
                      <TabsTrigger
                        key={tab}
                        value={tab}
                        className="rounded-md px-3 py-1.5 text-[13px] capitalize data-[state=active]:bg-muted"
                      >
                        {tab}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
                  <TabsContent value="overview" className="mt-0 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Quote number", quote.quoteNumber],
                        ["Currency", quote.currency],
                        ["Language", quote.language],
                        ["Country", quote.country ?? "—"],
                        ["Market", quote.market ?? "—"],
                        ["Contact", quote.contactName || "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border/60 px-4 py-3">
                          <div className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                            {label}
                          </div>
                          <div className="mt-1 text-[14px] font-medium">{value}</div>
                        </div>
                      ))}
                    </div>
                    {quote.notes ? (
                      <p className="text-[13px] text-muted-foreground">{quote.notes}</p>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="products" className="mt-0 space-y-4">
                    {editable ? (
                      <div className="space-y-3 rounded-lg border border-border/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            placeholder="Search catalog…"
                            value={productQuery}
                            onChange={(e) => setProductQuery(e.target.value)}
                            className="max-w-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          {filteredProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] hover:bg-muted/60"
                              onClick={() =>
                                void commands.addCatalogProduct.mutateAsync({
                                  quoteId: quote.id,
                                  productId: p.id,
                                })
                              }
                            >
                              <span>
                                {p.name}
                                <span className="ml-2 text-muted-foreground">{p.sku}</span>
                              </span>
                              <Plus className="size-3.5 text-muted-foreground" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <PricingTable
                      lines={data?.lines ?? []}
                      currency={quote.currency}
                      editable={editable}
                      onUpdate={(lineId, patch) =>
                        void commands.updateLine.mutateAsync({ quoteId: quote.id, lineId, ...patch })
                      }
                      onRemove={(lineId) =>
                        void commands.removeLine.mutateAsync({ quoteId: quote.id, lineId })
                      }
                    />
                  </TabsContent>

                  <TabsContent value="pricing" className="mt-0">
                    <PricingTable
                      lines={data?.lines ?? []}
                      currency={quote.currency}
                      editable={editable}
                      onUpdate={(lineId, patch) =>
                        void commands.updateLine.mutateAsync({ quoteId: quote.id, lineId, ...patch })
                      }
                      onRemove={(lineId) =>
                        void commands.removeLine.mutateAsync({ quoteId: quote.id, lineId })
                      }
                    />
                  </TabsContent>

                  <TabsContent value="timeline" className="mt-0 space-y-3">
                    {(data?.versions ?? []).map((v) => (
                      <div
                        key={v.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-[13px]",
                          v.id === quote.id && "bg-muted/30",
                        )}
                      >
                        <div>
                          <div className="font-medium">
                            {v.quoteNumber} · v{v.versionNumber}
                          </div>
                          <div className="text-muted-foreground capitalize">
                            {v.status.replaceAll("_", " ")} · {new Date(v.createdAt).toLocaleString()}
                          </div>
                        </div>
                        {v.isCurrent ? (
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Current
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </TabsContent>

                  {(["activities", "files", "ai"] as const).map((tab) => (
                    <TabsContent key={tab} value={tab} className="mt-0">
                      <EnterpriseEmptyState
                        icon={<FileText className="size-6" aria-hidden />}
                        title={`No ${tab} yet`}
                        description="Reserved for a later sales execution sprint."
                      />
                    </TabsContent>
                  ))}

                  <TabsContent value="audit" className="mt-0 space-y-2">
                    {(data?.history ?? []).length === 0 ? (
                      <EnterpriseEmptyState
                        icon={<FileText className="size-6" aria-hidden />}
                        title="No audit events"
                        description="Quote history will appear here as the quote evolves."
                      />
                    ) : (
                      (data?.history ?? []).map((h) => (
                        <div key={h.id} className="rounded-lg border border-border/60 px-4 py-3 text-[13px]">
                          <div className="font-medium">{h.summary || h.eventType}</div>
                          <div className="text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString()}
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="approvals" className="mt-0 space-y-3">
                    {(data?.approvals ?? []).length === 0 ? (
                      <EnterpriseEmptyState
                        icon={<ShieldCheck className="size-6" aria-hidden />}
                        title="No approvals"
                        description="Request internal review to start the approval foundation."
                      />
                    ) : (
                      (data?.approvals ?? []).map((a) => (
                        <div
                          key={a.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3 text-[13px]"
                        >
                          <div>
                            <div className="font-medium capitalize">{a.status}</div>
                            <div className="text-muted-foreground">
                              Requested {new Date(a.requestedAt).toLocaleString()}
                            </div>
                          </div>
                          {a.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  void commands.decideApproval.mutateAsync({
                                    quoteId: quote.id,
                                    approvalId: a.id,
                                    status: "approved",
                                  })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void commands.decideApproval.mutateAsync({
                                    quoteId: quote.id,
                                    approvalId: a.id,
                                    status: "rejected",
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              <StickyTotals quote={quote} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OpportunityQuotesPanel({
  opportunityId,
  onOpenQuote,
}: {
  opportunityId: string;
  onOpenQuote: (quoteId: string) => void;
}) {
  const { t } = useTranslation("common");
  const quotes = useOpportunityQuotes(opportunityId);
  const commands = useQuoteCommands();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">
            {t("quotes.panelTitle", { defaultValue: "Quotes" })}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {t("quotes.panelBody", {
              defaultValue: "Create quotes from this opportunity using the product catalog.",
            })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={commands.createFromOpportunity.isPending}
          onClick={() => {
            void commands.createFromOpportunity
              .mutateAsync({ opportunityId })
              .then((result) => onOpenQuote(result.quote.id));
          }}
        >
          {commands.createFromOpportunity.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 size-3.5" />
          )}
          {t("quotes.create", { defaultValue: "Create quote" })}
        </Button>
      </div>

      {quotes.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !quotes.data?.items.length ? (
        <EnterpriseEmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title={t("quotes.emptyTitle", { defaultValue: "No quotes yet" })}
          description={t("quotes.emptyBody", {
            defaultValue: "Create a quote to capture commercial terms for this opportunity.",
          })}
        />
      ) : (
        <div className="space-y-2">
          {quotes.data.items.map((q) => (
            <button
              key={q.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-left hover:bg-muted/40"
              onClick={() => onOpenQuote(q.id)}
            >
              <div>
                <div className="text-[14px] font-medium">
                  {q.quoteNumber} · v{q.versionNumber}
                </div>
                <div className="text-[12px] capitalize text-muted-foreground">
                  {q.status.replaceAll("_", " ")} · {money(q.grandTotal, q.currency)}
                </div>
              </div>
              <FileText className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
