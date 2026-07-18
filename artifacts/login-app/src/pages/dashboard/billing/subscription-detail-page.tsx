import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BillingAssignPlanDialog } from "@/components/billing/dialogs/billing-assign-plan-dialog";
import { BillingEditContactDialog } from "@/components/billing/dialogs/billing-edit-contact-dialog";
import { BillingRecordPaymentDialog } from "@/components/billing/dialogs/billing-record-payment-dialog";
import { BillingSubscriptionStatusDialog } from "@/components/billing/dialogs/billing-subscription-status-dialog";
import { CompanyIdentityHeader } from "@/components/billing/identity/company-identity-header";
import { CompanyProvisioningGate } from "@/components/billing/layout/company-provisioning-gate";
import { BillingContactPanel } from "@/components/billing/panels/billing-contact-panel";
import { InvoiceHistoryPanel } from "@/components/billing/panels/invoice-history-panel";
import { PaymentHistoryPanel } from "@/components/billing/panels/payment-history-panel";
import { PlanExperiencePanel } from "@/components/billing/panels/plan-experience-panel";
import { PlanFeaturesPanel } from "@/components/billing/panels/plan-features-panel";
import { ReceiptHistoryPanel } from "@/components/billing/panels/receipt-history-panel";
import { SubscriptionActivityPanel } from "@/components/billing/panels/subscription-activity-panel";
import { SubscriptionAuditPanel } from "@/components/billing/panels/subscription-audit-panel";
import { SubscriptionNotificationsPanel } from "@/components/billing/panels/subscription-notifications-panel";
import { SubscriptionTimelinePanel } from "@/components/billing/panels/subscription-timeline-panel";
import { UsageSummaryPanel } from "@/components/billing/panels/usage-summary-panel";
import { SubscriptionStatusBadge } from "@/components/billing/status/subscription-status-badge";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { DashboardPageFallback } from "@/components/dashboard/dashboard-page-fallback";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBillingHealthContext } from "@/context/billing-health-context";
import { useBillingPaymentOptions, BillingPaymentOptionsError } from "@/hooks/billing/use-billing-payment-options";
import { useCompanyProvisioning } from "@/hooks/billing/use-company-provisioning";
import { useRecordSubscriptionPayment } from "@/hooks/billing/use-record-subscription-payment";
import { useBillingSettingValue, parseBillingSettingString } from "@/hooks/billing/use-billing-setting-value";
import { useSubscriptionEvents } from "@/hooks/billing/use-subscription-events";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  canEditBilling,
  canRecordBillingPayment,
  canViewBilling,
  canViewBillingAudit,
} from "@/lib/billing/billing-permissions";
import { billingNotAvailable, translateBillingCycle, translateCompanyStatus } from "@/lib/billing/billing-display-i18n";
import { formatBillingCurrency, formatBillingDate } from "@/lib/billing/format";
import { isUuidSegment } from "@/lib/billing/subscription-status-display";
import { NEST_INDEX } from "@/lib/routing";

export function SubscriptionDetailPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [, params] = useRoute("/:companyId");
  const companyId = params?.companyId && isUuidSegment(params.companyId) ? params.companyId : null;
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const { mutationsAllowed } = useBillingHealthContext();
  const canView = canViewBilling(hasPermission, isSuperAdmin);
  const canViewAudit = canViewBillingAudit(hasPermission, isSuperAdmin);
  const canEdit = canEditBilling(hasPermission, isSuperAdmin) && mutationsAllowed;
  const canRecord = canRecordBillingPayment(hasPermission, isSuperAdmin) && mutationsAllowed;

  const {
    provisioning,
    isLoading: provisioningLoading,
    error: provisioningError,
    subscription,
    billingContact,
  } = useCompanyProvisioning(companyId, canView);

  const { data: events = [], isLoading: eventsLoading } = useSubscriptionEvents(subscription?.id ?? null, canView);
  const { data: defaultCurrencySetting, isLoading: currencyLoading, isError: currencyError } = useBillingSettingValue(
    "default_currency",
    companyId,
    Boolean(companyId && canRecord),
  );
  const recordPayment = useRecordSubscriptionPayment();
  const {
    data: paymentOptions,
    isLoading: paymentOptionsLoading,
    isError: paymentOptionsIsError,
    error: paymentOptionsError,
  } = useBillingPaymentOptions(companyId, Boolean(companyId && canRecord));

  const [editContactOpen, setEditContactOpen] = useState(false);
  const [assignPlanOpen, setAssignPlanOpen] = useState(false);
  const [statusDialogMode, setStatusDialogMode] = useState<"suspend" | "restore" | null>(null);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedMethodCode, setSelectedMethodCode] = useState("");

  const paymentMethods = paymentOptions?.payment_methods ?? [];

  const paymentConfigurationError = useMemo(() => {
    if (!canRecord || paymentOptionsLoading) return null;
    if (!paymentOptionsIsError) return null;
    if (paymentOptionsError instanceof BillingPaymentOptionsError) {
      if (paymentOptionsError.code === "migration_missing") {
        return t("billing.payment.runtimeNotConfigured");
      }
      if (paymentOptionsError.code === "no_methods") {
        return t("billing.payment.noMethodsConfigured");
      }
    }
    return paymentOptionsError instanceof Error ? paymentOptionsError.message : t("billing.payment.loadFailed");
  }, [canRecord, paymentOptionsLoading, paymentOptionsIsError, paymentOptionsError, t]);

  useEffect(() => {
    if (paymentMethods.length === 0) {
      setSelectedMethodCode("");
      return;
    }
    if (!paymentMethods.some((method) => method.code === selectedMethodCode)) {
      setSelectedMethodCode(paymentMethods[0]?.code ?? "");
    }
  }, [paymentMethods, selectedMethodCode]);

  const currency = useMemo(
    () => parseBillingSettingString(defaultCurrencySetting),
    [defaultCurrencySetting],
  );

  const currencyUnavailable = !currencyLoading && (currencyError || !currency);

  const showToastError = (message: string) => {
    toast({ variant: "destructive", title: t("billing.toast.errorTitle"), description: message });
  };

  const showToastSuccess = (description: string) => {
    toast({ title: t("billing.toast.successTitle"), description });
  };

  if (!companyId) {
    return <p className="text-sm text-muted-foreground">{t("billing.detail.notFound")}</p>;
  }

  if (!canView) {
    return <p className="text-sm text-muted-foreground">{t("billing.noPermission")}</p>;
  }

  if (provisioningLoading) {
    return <DashboardPageFallback />;
  }

  if (provisioningError) {
    return <DashboardErrorBanner message={provisioningError.message} />;
  }

  if (provisioning && !provisioning.ready) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={NEST_INDEX}>
            <ArrowLeft className="h-4 w-4 me-2" />
            {t("billing.actions.backToOverview")}
          </Link>
        </Button>
        <CompanyProvisioningGate issues={provisioning.issues} />
      </div>
    );
  }

  if (!subscription) {
    return <DashboardErrorBanner message={t("billing.provisioning.fallbackError")} />;
  }

  const companySuspended = subscription.company?.status === "Suspended";

  const planPrice =
    subscription.billing_cycle === "yearly"
      ? subscription.plan?.price_yearly
      : subscription.plan?.price_monthly;

  const handleRecordPayment = () => {
    if (!mutationsAllowed) return;
    if (!planPrice || !currency || !selectedMethodCode) {
      setPaymentError(t("billing.payment.noMethods"));
      return;
    }
    setPaymentError(null);
    const selectedMethod = paymentMethods.find((method) => method.code === selectedMethodCode);
    recordPayment.mutate(
      {
        companyId: subscription.company_id,
        amount: Number(planPrice),
        currency,
        paymentMethodCode: selectedMethodCode,
        paymentMethodLabel: selectedMethod?.display_name,
      },
      {
        onSuccess: () => {
          setRecordPaymentOpen(false);
          showToastSuccess(t("billing.payment.success"));
        },
        onError: (mutationError) => {
          setPaymentError(mutationError.message);
          showToastError(mutationError.message);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={NEST_INDEX}>
            <ArrowLeft className="h-4 w-4 me-2" />
            {t("billing.actions.backToOverview")}
          </Link>
        </Button>
      </div>

      <CompanyIdentityHeader
        companyId={subscription.company_id}
        name={subscription.company?.name ?? billingNotAvailable(t)}
        logoUrl={subscription.company?.logo_url}
        companyType={subscription.company?.company_type}
        billingContact={billingContact}
      />

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditContactOpen(true)}>
            {t("billing.edit.editContact")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAssignPlanOpen(true)}>
            {t("billing.edit.assignPlan")}
          </Button>
          {companySuspended ? (
            <Button size="sm" variant="outline" onClick={() => setStatusDialogMode("restore")}>
              {t("billing.edit.restoreSubscription")}
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setStatusDialogMode("suspend")}>
              {t("billing.edit.suspendSubscription")}
            </Button>
          )}
        </div>
      ) : null}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-card/40 p-1">
          <TabsTrigger value="overview">{t("billing.detail.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("billing.detail.tabs.timeline")}</TabsTrigger>
          <TabsTrigger value="activity">{t("billing.detail.tabs.activity")}</TabsTrigger>
          <TabsTrigger value="invoices">{t("billing.detail.tabs.invoices")}</TabsTrigger>
          <TabsTrigger value="payments">{t("billing.detail.tabs.payments")}</TabsTrigger>
          <TabsTrigger value="receipts">{t("billing.detail.tabs.receipts")}</TabsTrigger>
          <TabsTrigger value="entitlements">{t("billing.detail.tabs.entitlements")}</TabsTrigger>
          {canViewAudit ? <TabsTrigger value="audit">{t("billing.detail.tabs.audit")}</TabsTrigger> : null}
          <TabsTrigger value="notifications">{t("billing.detail.tabs.notifications")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <DashboardCard className="p-5 space-y-4 xl:col-span-1">
              <h2 className="font-semibold">{t("billing.detail.subscription")}</h2>
              <SubscriptionStatusBadge
                status={subscription.status}
                currentPeriodEnd={subscription.current_period_end}
                nextRenewalAt={subscription.next_renewal_at}
                trialEndsAt={subscription.trial_ends_at}
                gracePeriodEndsAt={subscription.grace_period_ends_at}
              />
              {subscription.company?.status ? (
                <p className="text-xs text-muted-foreground">
                  {t("billing.edit.companyAccess")}: {translateCompanyStatus(t, subscription.company.status)}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("billing.detail.cycle")}</p>
                  <p className="font-medium">{translateBillingCycle(t, subscription.billing_cycle)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("billing.detail.autoRenewal")}</p>
                  <p className="font-medium">{subscription.auto_renewal ? t("billing.common.yes") : t("billing.common.no")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("billing.detail.periodEnd")}</p>
                  <p className="font-medium">{formatBillingDate(subscription.current_period_end)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("billing.detail.nextRenewal")}</p>
                  <p className="font-medium">{formatBillingDate(subscription.next_renewal_at)}</p>
                </div>
              </div>
              {canRecord ? (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    disabled={
                      recordPayment.isPending ||
                      !planPrice ||
                      currencyUnavailable ||
                      Boolean(paymentConfigurationError) ||
                      paymentOptionsLoading
                    }
                    onClick={() => setRecordPaymentOpen(true)}
                  >
                    {recordPayment.isPending ? t("billing.detail.recording") : t("billing.detail.recordPayment")}
                    {planPrice && currency ? ` · ${formatBillingCurrency(planPrice, currency)}` : ""}
                  </Button>
                  {currencyUnavailable ? (
                    <p className="text-xs text-destructive">{t("billing.detail.currencyMissing")}</p>
                  ) : null}
                  {paymentConfigurationError ? (
                    <p className="text-xs text-destructive">{paymentConfigurationError}</p>
                  ) : null}
                  {paymentError ? <p className="text-xs text-destructive">{paymentError}</p> : null}
                </div>
              ) : null}
            </DashboardCard>

            <div className="xl:col-span-2 space-y-4">
              <PlanExperiencePanel
                subscription={subscription}
                canChangePlan={canEdit}
                onPlanChanged={() => showToastSuccess(t("billing.edit.planSaved"))}
                onPlanChangeError={showToastError}
              />
              <UsageSummaryPanel subscription={subscription} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <BillingContactPanel
              contact={billingContact}
              loading={false}
              canEdit={canEdit}
              onEdit={() => setEditContactOpen(true)}
            />
            <PlanFeaturesPanel companyId={subscription.company_id} />
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <SubscriptionTimelinePanel
            events={events}
            loading={eventsLoading}
            subscription={subscription}
            companyCreatedAt={subscription.company?.created_at}
          />
        </TabsContent>

        <TabsContent value="activity">
          <SubscriptionActivityPanel events={events} loading={eventsLoading} />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoiceHistoryPanel companyId={subscription.company_id} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentHistoryPanel companyId={subscription.company_id} />
        </TabsContent>

        <TabsContent value="receipts">
          <ReceiptHistoryPanel companyId={subscription.company_id} />
        </TabsContent>

        <TabsContent value="entitlements">
          <PlanFeaturesPanel companyId={subscription.company_id} />
        </TabsContent>

        {canViewAudit ? (
          <TabsContent value="audit">
            <SubscriptionAuditPanel companyId={subscription.company_id} enabled={canViewAudit} />
          </TabsContent>
        ) : null}

        <TabsContent value="notifications">
          <SubscriptionNotificationsPanel
            companyId={subscription.company_id}
            enabled={canView}
            companyName={subscription.company?.name}
          />
        </TabsContent>
      </Tabs>

      <BillingEditContactDialog
        open={editContactOpen}
        onOpenChange={setEditContactOpen}
        companyId={subscription.company_id}
        contact={billingContact}
        onSuccess={() => showToastSuccess(t("billing.edit.contactSaved"))}
        onError={showToastError}
      />

      <BillingAssignPlanDialog
        open={assignPlanOpen}
        onOpenChange={setAssignPlanOpen}
        subscription={subscription}
        onSuccess={() => showToastSuccess(t("billing.edit.planSaved"))}
        onError={showToastError}
      />

      {statusDialogMode ? (
        <BillingSubscriptionStatusDialog
          open
          onOpenChange={(open) => !open && setStatusDialogMode(null)}
          companyId={subscription.company_id}
          mode={statusDialogMode}
          onSuccess={() =>
            showToastSuccess(
              statusDialogMode === "suspend"
                ? t("billing.edit.suspendSuccess")
                : t("billing.edit.restoreSuccess"),
            )
          }
          onError={showToastError}
        />
      ) : null}

      <BillingRecordPaymentDialog
        open={recordPaymentOpen}
        onOpenChange={setRecordPaymentOpen}
        amount={Number(planPrice ?? 0)}
        currency={currency ?? ""}
        loading={recordPayment.isPending}
        paymentMethods={paymentMethods}
        selectedMethodCode={selectedMethodCode}
        onMethodChange={setSelectedMethodCode}
        activeMode={paymentOptions?.active_mode ?? "production"}
        activeProviderCode={paymentOptions?.active_provider_code ?? "manual"}
        autoRenewal={subscription.auto_renewal}
        configurationError={paymentConfigurationError}
        onConfirm={handleRecordPayment}
      />
    </div>
  );
}
