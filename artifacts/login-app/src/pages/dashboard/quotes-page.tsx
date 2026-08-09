import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { BriefcaseBusiness, FileText, Plus } from "lucide-react";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Quote360Workspace } from "@/components/quotes/quote360-workspace";
import { Opportunity360Workspace } from "@/components/opportunities/opportunity360-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuotesList, useQuoteCommands } from "@/hooks/quotes/use-quote-commands";
import { useOpportunityList } from "@/hooks/opportunities/use-opportunity-commands";
import { useAuthUser } from "@/hooks/use-rbac";
import { useToast } from "@/hooks/use-toast";
import { resolveApplicationErrorMessage } from "@/lib/application-layer/application-layer-result";
import {
  formatSalesMoney,
  localizeQuoteStatus,
} from "@/lib/sales/sales-localize";
import { cn } from "@/lib/utils";

export function QuotesPage() {
  const { t, i18n } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canCreate = isSuperAdmin || hasPermission("quotes.create");
  const list = useQuotesList({ currentOnly: true });
  const opportunities = useOpportunityList({ limit: 50 });
  const commands = useQuoteCommands();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [opportunityId, setOpportunityId] = useState<string | null>(null);

  const opportunityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of opportunities.data?.items ?? []) {
      map.set(item.id, item.name);
    }
    return map;
  }, [opportunities.data?.items]);

  const items = list.data?.items ?? [];

  return (
    <div className="flex min-h-0 w-full flex-col gap-5" dir={i18n.dir()}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.35rem] font-semibold tracking-tight">
            {t("navigation.quotes")}
          </h1>
          <p className="max-w-2xl text-[13px] text-muted-foreground">{t("quotes.subtitle")}</p>
          <p className="text-[12px] text-muted-foreground/90">{t("quotes.integrationHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl">
            <Link href="~/dashboard/products">{t("quotes.openCatalog")}</Link>
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl">
            <Link href="~/dashboard/opportunities">{t("quotes.openOpportunities")}</Link>
          </Button>
          {canCreate ? (
            <Button
              type="button"
              className="gap-2 rounded-xl"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              {t("quotes.createFromOpportunity")}
            </Button>
          ) : null}
        </div>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EnterpriseEmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title={t("quotes.emptyTitle")}
          description={t("quotes.emptyBody")}
          primaryAction={
            canCreate
              ? {
                  label: t("quotes.createFromOpportunity"),
                  onClick: () => setPickerOpen(true),
                }
              : undefined
          }
          secondaryAction={{
            label: t("quotes.openOpportunities"),
            onClick: () => setLocation("~/dashboard/opportunities"),
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
          <div className="hidden border-b border-border/40 bg-muted/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] md:gap-3">
            <span>{t("quotes.columns.quote")}</span>
            <span>{t("quotes.columns.contact")}</span>
            <span>{t("quotes.columns.status")}</span>
            <span>{t("quotes.columns.total")}</span>
            <span>{t("quotes.columns.updated")}</span>
            <span className="sr-only">{t("quotes.openOpportunity")}</span>
          </div>
          <ul className="divide-y divide-border/40">
            {items.map((quote) => {
              const opportunityName = quote.opportunityId
                ? opportunityNameById.get(quote.opportunityId)
                : null;
              return (
                <li key={quote.id} className="group relative">
                  <button
                    type="button"
                    className="grid w-full gap-2 px-4 py-3.5 text-start transition-colors hover:bg-muted/25 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-3"
                    onClick={() => {
                      setSelectedId(quote.id);
                      setOpen(true);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold tracking-tight">
                        {quote.quoteNumber}
                        <span className="ms-1.5 text-[12px] font-medium text-muted-foreground">
                          {t("quotes.version", { version: quote.versionNumber })}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {quote.title}
                        {opportunityName ? ` · ${opportunityName}` : ""}
                      </p>
                    </div>
                    <p className="truncate text-[13px] text-foreground/90">
                      {quote.contactName?.trim() || "—"}
                    </p>
                    <span
                      className={cn(
                        "inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-semibold",
                        quote.status === "accepted" || quote.status === "converted"
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : quote.status === "rejected" || quote.status === "expired"
                            ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {localizeQuoteStatus(t, quote.status)}
                    </span>
                    <p className="text-[13px] font-medium tabular-nums">
                      {formatSalesMoney(quote.grandTotal, quote.currency, i18n.language)}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(quote.updatedAt))}
                    </p>
                    <span className="hidden md:block" />
                  </button>
                  {quote.opportunityId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-lg md:inline-flex"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpportunityId(quote.opportunityId);
                      }}
                    >
                      {t("quotes.openOpportunity")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("quotes.pickOpportunityTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">{t("quotes.pickOpportunityBody")}</p>
          <div className="max-h-[320px] space-y-2 overflow-y-auto py-2">
            {(opportunities.data?.items ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                {t("quotes.pickOpportunityEmpty")}
              </p>
            ) : (
              (opportunities.data?.items ?? []).map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-start transition hover:bg-muted/30"
                  disabled={commands.createFromOpportunity.isPending}
                  onClick={() => {
                    commands.createFromOpportunity.mutate(
                      { opportunityId: opp.id },
                      {
                        onSuccess: (result) => {
                          setPickerOpen(false);
                          toast({ title: t("quotes.createSuccess") });
                          setSelectedId(result.quote.id);
                          setOpen(true);
                        },
                        onError: (error) => {
                          toast({
                            title: t("quotes.createFailed"),
                            description: resolveApplicationErrorMessage(error),
                            variant: "destructive",
                          });
                        },
                      },
                    );
                  }}
                >
                  <BriefcaseBusiness className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{opp.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[opp.companyName, opp.primaryContact].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {formatSalesMoney(opp.expectedRevenue, opp.currency, i18n.language)}
                  </span>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>
              {t("products.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Quote360Workspace
        quoteId={selectedId}
        open={open}
        onOpenChange={setOpen}
        onVersionCreated={(id) => setSelectedId(id)}
      />

      <Opportunity360Workspace
        opportunityId={opportunityId}
        open={Boolean(opportunityId)}
        onOpenChange={(next) => {
          if (!next) setOpportunityId(null);
        }}
      />
    </div>
  );
}
