import { useEffect, useMemo, useState } from "react";
import { MessageSquareReply } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { DashboardCard } from "@/components/dashboard/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesFollowUpTab } from "@/components/settings/sales/sales-follow-up-tab";
import { SalesOrderManagementTab } from "@/components/settings/sales/sales-order-management-tab";
import { SalesDeliverySettingsTab } from "@/components/settings/sales/sales-delivery-settings-tab";
import { SalesDeliveryWorkersTab } from "@/components/settings/sales/sales-delivery-workers-tab";
import { SalesOrderApprovalsTab } from "@/components/settings/sales/sales-order-approvals-tab";

const SALES_FOLLOW_UP_TABS = ["follow-up", "orders", "delivery", "workers", "approvals"] as const;
type SalesFollowUpTabId = (typeof SALES_FOLLOW_UP_TABS)[number];

function resolveSalesFollowUpTab(search: string): SalesFollowUpTabId {
  const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
  return (SALES_FOLLOW_UP_TABS as readonly string[]).includes(raw ?? "")
    ? (raw as SalesFollowUpTabId)
    : "follow-up";
}

function useWorkerStatus() {
  const [status, setStatus] = useState<{
    workerEnabled: boolean;
    allowSend: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apiBase = (import.meta.env.VITE_API_SERVER_URL as string | undefined)?.replace(/\/$/, "") || "";
    if (!apiBase) return;
    void fetch(`${apiBase}/api/sales-follow-up/status`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { workerEnabled?: boolean; allowSend?: boolean };
      })
      .then((body) => {
        if (cancelled || !body) return;
        setStatus({
          workerEnabled: body.workerEnabled === true,
          allowSend: body.allowSend === true,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

export function SettingsSalesFollowUpPage() {
  const { t, i18n } = useTranslation("common");
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = profile?.company_id ?? null;
  const canEdit =
    isSuperAdmin || hasPermission("settings.edit") || hasPermission("leads.manage");
  const workerStatus = useWorkerStatus();
  const dir = i18n.dir();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const tabFromUrl = useMemo(() => resolveSalesFollowUpTab(search), [search]);
  const [tab, setTab] = useState<SalesFollowUpTabId>(tabFromUrl);

  useEffect(() => {
    setTab(tabFromUrl);
  }, [tabFromUrl]);

  const onTabChange = (value: string) => {
    const next = (SALES_FOLLOW_UP_TABS as readonly string[]).includes(value)
      ? (value as SalesFollowUpTabId)
      : "follow-up";
    setTab(next);
    setLocation(`/dashboard/settings/sales/follow-up?tab=${next}`);
  };

  return (
    <DashboardCard className="overflow-hidden">
      <div className="border-b border-border/60 p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquareReply className="size-4 text-primary" />
          {t("dashboard.settings.salesFollowUp.title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("dashboard.settings.salesFollowUp.subtitle")}
        </p>
      </div>

      <div className="p-5 pt-3" dir={dir}>
        <Tabs value={tab} onValueChange={onTabChange} dir={dir}>
          <TabsList className="flex h-auto w-full justify-start gap-0 rounded-none border-b border-border/60 bg-transparent p-0">
            <TabsTrigger
              value="follow-up"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              {t("dashboard.settings.salesOrder.tabs.followUp")}
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              {t("dashboard.settings.salesOrder.tabs.orders")}
            </TabsTrigger>
            <TabsTrigger
              value="delivery"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              {t("dashboard.settings.salesOrder.tabs.delivery")}
            </TabsTrigger>
            <TabsTrigger
              value="workers"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              {t("dashboard.settings.salesOrder.tabs.workers")}
            </TabsTrigger>
            <TabsTrigger
              value="approvals"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            >
              {t("dashboard.settings.salesOrder.tabs.approvals")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="follow-up" className="mt-4">
            <SalesFollowUpTab companyId={companyId} canEdit={canEdit} workerStatus={workerStatus} />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <SalesOrderManagementTab companyId={companyId} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="delivery" className="mt-4">
            <SalesDeliverySettingsTab companyId={companyId} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="workers" className="mt-4">
            <SalesDeliveryWorkersTab
              companyId={companyId}
              canEdit={canEdit}
              onOpenDeliverySettings={() => onTabChange("delivery")}
            />
          </TabsContent>
          <TabsContent value="approvals" className="mt-4">
            <SalesOrderApprovalsTab companyId={companyId} canEdit={canEdit} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardCard>
  );
}
