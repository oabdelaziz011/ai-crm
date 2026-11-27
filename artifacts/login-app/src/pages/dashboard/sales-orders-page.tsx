import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Search } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useSalesOrdersList } from "@/hooks/sales/use-sales-orders";
import {
  SALES_ORDER_STATUSES,
  SALES_ORDERS_PAGE_SIZES,
  type SalesOrderPaymentMethod,
  type SalesOrderStatus,
  type SalesOrdersPageSize,
} from "@/lib/sales-orders/sales-order-types";
import { formatSalesMoney } from "@/lib/sales/sales-localize";
import { EnterpriseEmptyState } from "@/components/enterprise";
import { DashboardErrorBanner } from "@/components/dashboard/ui";
import { NumberedListPagination } from "@/components/ui/numbered-list-pagination";
import { SalesOrderDetailsPanel } from "@/components/sales-orders/sales-order-details-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function statusBadgeClass(status: SalesOrderStatus): string {
  switch (status) {
    case "delivered":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "cancelled":
      return "bg-destructive/10 text-destructive";
    case "pending_approval":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "confirmed":
    case "processing":
    case "out_for_delivery":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function SalesOrdersPage() {
  const { t, i18n } = useTranslation("common");
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = profile?.company_id ?? null;
  const canView = isSuperAdmin || hasPermission("orders.view");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SalesOrderStatus | "all">("all");
  const [paymentMethod, setPaymentMethod] = useState<SalesOrderPaymentMethod | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<SalesOrdersPageSize>(25);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const filters = useMemo(
    () => ({ search, status, paymentMethod, dateFrom, dateTo, page, pageSize }),
    [search, status, paymentMethod, dateFrom, dateTo, page, pageSize],
  );

  const list = useSalesOrdersList(canView ? companyId : null, filters);
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;

  if (!canView) {
    return (
      <div className="space-y-2 p-6" dir={i18n.dir()}>
        <h1 className="text-[1.35rem] font-semibold tracking-tight">{t("navigation.salesOrders")}</h1>
        <p className="text-sm text-muted-foreground">{t("salesOrders.noPermission")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-5" dir={i18n.dir()} data-testid="sales-orders-page">
      <div className="space-y-1">
        <h1 className="text-[1.35rem] font-semibold tracking-tight">{t("navigation.salesOrders")}</h1>
        <p className="max-w-2xl text-[13px] text-muted-foreground">{t("salesOrders.subtitle")}</p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/50 bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="sales-orders-search">{t("salesOrders.filters.search")}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="sales-orders-search"
              className="ps-9"
              value={search}
              placeholder={t("salesOrders.filters.searchPlaceholder")}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sales-orders-status">{t("salesOrders.filters.status")}</Label>
          <select
            id="sales-orders-status"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => {
              const next = event.target.value;
              setStatus(next === "all" ? "all" : (next as SalesOrderStatus));
              setPage(1);
            }}
          >
            <option value="all">{t("salesOrders.filters.allStatuses")}</option>
            {SALES_ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`salesOrders.status.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sales-orders-payment">{t("salesOrders.filters.payment")}</Label>
          <select
            id="sales-orders-payment"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={paymentMethod}
            onChange={(event) => {
              const next = event.target.value;
              setPaymentMethod(next === "all" ? "all" : (next as SalesOrderPaymentMethod));
              setPage(1);
            }}
          >
            <option value="all">{t("salesOrders.filters.allPayments")}</option>
            <option value="cash_on_delivery">{t("salesOrders.payment.cash_on_delivery")}</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
          <div className="space-y-1">
            <Label htmlFor="sales-orders-from">{t("salesOrders.filters.from")}</Label>
            <Input
              id="sales-orders-from"
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sales-orders-to">{t("salesOrders.filters.to")}</Label>
            <Input
              id="sales-orders-to"
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {list.error ? <DashboardErrorBanner message={list.error.message} /> : null}

      {list.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : items.length === 0 ? (
        <EnterpriseEmptyState
          icon={<ClipboardList className="size-6" aria-hidden />}
          title={t("salesOrders.emptyTitle")}
          description={t("salesOrders.emptyBody")}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card/40 shadow-sm">
          <div className="hidden border-b border-border/40 bg-muted/20 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground xl:grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] xl:gap-3">
            <span>{t("salesOrders.columns.orderNumber")}</span>
            <span>{t("salesOrders.columns.customer")}</span>
            <span>{t("salesOrders.columns.phone")}</span>
            <span>{t("salesOrders.columns.items")}</span>
            <span>{t("salesOrders.columns.total")}</span>
            <span>{t("salesOrders.columns.deliveryFee")}</span>
            <span>{t("salesOrders.columns.payment")}</span>
            <span>{t("salesOrders.columns.status")}</span>
            <span>{t("salesOrders.columns.actions")}</span>
          </div>

          <div className="divide-y divide-border/40">
            {items.map((order) => (
              <div
                key={order.id}
                className="grid gap-2 px-4 py-3 text-sm xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_auto] xl:items-center xl:gap-3"
              >
                <div>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground xl:hidden">
                    {new Date(order.createdAt).toLocaleString(i18n.language)}
                  </p>
                </div>
                <p>{order.customerName || "—"}</p>
                <p dir="ltr">{order.customerPhone || "—"}</p>
                <p className="truncate text-muted-foreground">
                  {order.itemsSummary || t("salesOrders.noItems")}
                </p>
                <p className="tabular-nums">
                  {formatSalesMoney(order.totalAmount, order.currency, i18n.language)}
                </p>
                <p className="tabular-nums">
                  {formatSalesMoney(order.deliveryFee, order.currency, i18n.language)}
                </p>
                <p>{t(`salesOrders.payment.${order.paymentMethod}`)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      statusBadgeClass(order.status),
                    )}
                  >
                    {t(`salesOrders.status.${order.status}`)}
                  </span>
                  <span className="hidden text-xs text-muted-foreground xl:inline">
                    {new Date(order.createdAt).toLocaleDateString(i18n.language)}
                  </span>
                </div>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      setSelectedId(order.id);
                      setDetailsOpen(true);
                    }}
                  >
                    {t("salesOrders.actions.view")}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <NumberedListPagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            pageSizeOptions={SALES_ORDERS_PAGE_SIZES}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize((SALES_ORDERS_PAGE_SIZES as readonly number[]).includes(next) ? (next as SalesOrdersPageSize) : 25);
              setPage(1);
            }}
          />
        </div>
      )}

      <SalesOrderDetailsPanel
        companyId={companyId}
        orderId={selectedId}
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
