import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { Quote360Workspace } from "@/components/quotes/quote360-workspace";
import { useQuotesList } from "@/hooks/quotes/use-quote-commands";
import { Skeleton } from "@/components/ui/skeleton";

function money(value: number | null | undefined, currency: string) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export function QuotesPage() {
  const { t } = useTranslation("common");
  const list = useQuotesList({ currentOnly: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-0 w-full flex-col gap-4">
      <div>
        <h1 className="text-[1.25rem] font-semibold tracking-tight">
          {t("navigation.quotes", { defaultValue: "Quotes" })}
        </h1>
        <p className="text-[13px] text-muted-foreground">
          {t("quotes.subtitle", {
            defaultValue: "Enterprise quote builder on Opportunity + Product Catalog.",
          })}
        </p>
      </div>

      {list.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !list.data?.items.length ? (
        <EnterpriseEmptyState
          icon={<FileText className="size-6" aria-hidden />}
          title={t("quotes.emptyTitle", { defaultValue: "No quotes yet" })}
          description={t("quotes.emptyBody", {
            defaultValue: "Create a quote from an Opportunity to get started.",
          })}
        />
      ) : (
        <div className="space-y-2">
          {list.data.items.map((q) => (
            <button
              key={q.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border/60 px-4 py-3 text-left hover:bg-muted/40"
              onClick={() => {
                setSelectedId(q.id);
                setOpen(true);
              }}
            >
              <div>
                <div className="text-[14px] font-medium">
                  {q.quoteNumber} · v{q.versionNumber} · {q.title}
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

      <Quote360Workspace
        quoteId={selectedId}
        open={open}
        onOpenChange={setOpen}
        onVersionCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}
