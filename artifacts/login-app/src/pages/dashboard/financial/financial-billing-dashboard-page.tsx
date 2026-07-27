import { useTranslation } from "react-i18next";
import { DollarSign, CreditCard, FileText, RefreshCw, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useFinancialDashboard } from "@/lib/billing/hooks/use-financial-dashboard";
import { formatMoney } from "@/lib/billing/utilities/money";
import { downloadCsv } from "@/lib/billing/export-csv";

type FinancialBillingDashboardPageProps = Record<string, never>;

export function FinancialBillingDashboardPage(_props: FinancialBillingDashboardPageProps) {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { metrics, invoices, payments, refunds, isLoading } = useFinancialDashboard(companyId);

  const revenue = metrics.data;

  const handleExport = () => {
    const rows = (invoices.data ?? []).map((inv) => [
      inv.invoiceNumber ?? inv.id,
      inv.status,
      String(inv.totalCents / 100),
      String(inv.paidCents / 100),
      inv.currency,
    ]);
    downloadCsv("financial-invoices.csv", ["number", "status", "total", "paid", "currency"], rows);
  };

  if (!companyId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        {t("financial.noCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("financial.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("financial.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={isLoading}>
          {t("financial.export")}
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("financial.revenueCards")}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("financial.dailyRevenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(revenue?.dailyCents ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("financial.monthlyRevenue")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(revenue?.monthlyCents ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("financial.outstanding")}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(revenue?.outstandingCents ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("financial.avgInvoice")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(revenue?.averageInvoiceCents ?? 0)}</div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("financial.recentInvoices")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(invoices.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("financial.noInvoices")}</p>
            ) : (
              <ul className="space-y-2">
                {(invoices.data ?? []).slice(0, 8).map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3 text-sm">
                    <div>
                      <div className="font-medium">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</div>
                      <div className="text-muted-foreground">{formatMoney(inv.totalCents, inv.currency)}</div>
                    </div>
                    <Badge variant="outline">{inv.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("financial.recentPayments")}</CardTitle>
          </CardHeader>
          <CardContent>
            {(payments.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("financial.noPayments")}</p>
            ) : (
              <ul className="space-y-2">
                {(payments.data ?? []).slice(0, 8).map((pay) => (
                  <li key={pay.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3 text-sm">
                    <div>
                      <div className="font-medium">{pay.paymentMethod}</div>
                      <div className="text-muted-foreground">{formatMoney(pay.amountCents, pay.currency)}</div>
                    </div>
                    <Badge variant="outline">{pay.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden />
          <CardTitle>{t("financial.recentRefunds")}</CardTitle>
        </CardHeader>
        <CardContent>
          {(refunds.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("financial.noRefunds")}</p>
          ) : (
            <ul className="space-y-2">
              {(refunds.data ?? []).slice(0, 5).map((ref) => (
                <li key={ref.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3 text-sm">
                  <span>{ref.reason ?? ref.refundType}</span>
                  <span>{formatMoney(ref.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
