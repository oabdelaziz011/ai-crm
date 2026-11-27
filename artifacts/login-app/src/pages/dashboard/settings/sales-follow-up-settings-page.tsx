import { useEffect, useState } from "react";
import { MessageSquareReply } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { DashboardCard } from "@/components/dashboard/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesFollowUpTab } from "@/components/settings/sales/sales-follow-up-tab";
import { SalesOrderManagementTab } from "@/components/settings/sales/sales-order-management-tab";
import { SalesDeliverySettingsTab } from "@/components/settings/sales/sales-delivery-settings-tab";
import { SalesOrderApprovalsTab } from "@/components/settings/sales/sales-order-approvals-tab";

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
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const companyId = profile?.company_id ?? null;
  const canEdit =
    isSuperAdmin || hasPermission("settings.edit") || hasPermission("leads.manage");
  const workerStatus = useWorkerStatus();

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

      <div className="p-5 pt-3">
        <Tabs defaultValue="follow-up">
          <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border/60 bg-transparent p-0">
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
          <TabsContent value="approvals" className="mt-4">
            <SalesOrderApprovalsTab companyId={companyId} canEdit={canEdit} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardCard>
  );
}
