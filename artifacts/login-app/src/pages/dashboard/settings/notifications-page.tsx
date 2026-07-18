import { AlertCircle, Bell, LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { DashboardCard } from "@/components/dashboard/ui";

export function SettingsNotificationsPage() {
  const { t } = useTranslation("common");
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();

  const handleSignOut = async () => {
    await signOut();
    setLocation("~/login");
  };

  return (
    <div className="space-y-6">
      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-5 flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          {t("common.notifications")}
        </h3>
        <div className="space-y-4">
          {[
            { label: t("dashboard.settings.notifications.newBookings"), on: true },
            { label: t("dashboard.settings.notifications.invoicePaid"), on: true },
            { label: t("dashboard.settings.notifications.whatsappAlerts"), on: false },
            { label: t("dashboard.settings.notifications.weeklyReport"), on: true },
            { label: t("dashboard.settings.notifications.aiInsights"), on: false },
          ].map((n) => (
            <div key={n.label} className="flex items-center justify-between">
              <span className="text-sm">{n.label}</span>
              <div
                className={`w-10 h-5 rounded-full border cursor-pointer transition-colors relative ${n.on ? "bg-primary/30 border-primary/50" : "bg-white/5 border-white/10"}`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${n.on ? "start-5 bg-primary" : "start-0.5 bg-white/30"}`}
                />
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard className="p-6">
        <h3 className="font-semibold mb-4 text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {t("common.account")}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs gap-2"
          onClick={handleSignOut}
        >
          <LogOut className="w-3.5 h-3.5" />
          {t("buttons.signOut")}
        </Button>
      </DashboardCard>
    </div>
  );
}
