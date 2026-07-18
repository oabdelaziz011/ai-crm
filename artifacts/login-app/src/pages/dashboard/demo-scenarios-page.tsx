import { FlaskConical, Loader2, RefreshCcw, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardCard, DashboardErrorBanner } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  useDemoScenarioStatus,
  useDemoScenarios,
  useResetDemoEnvironment,
  useSwitchDemoScenario,
} from "@/hooks/demo/use-demo-scenarios";

export function DemoScenariosPage() {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthUser();
  const { data: scenarios = [], isLoading, error } = useDemoScenarios(isSuperAdmin);
  const { data: status } = useDemoScenarioStatus(isSuperAdmin);
  const switchScenario = useSwitchDemoScenario();
  const resetDemo = useResetDemoEnvironment();

  if (!isSuperAdmin) {
    return <p className="text-sm text-muted-foreground">{t("demo.scenarios.noPermission")}</p>;
  }

  const busy = switchScenario.isPending || resetDemo.isPending;

  const handleSwitch = async (code: string) => {
    try {
      await switchScenario.mutateAsync(code);
      toast({
        title: t("demo.scenarios.switchSuccess"),
        description: t("demo.scenarios.switchSuccessDetail"),
      });
    } catch (e) {
      toast({
        title: t("demo.scenarios.switchError"),
        description: e instanceof Error ? e.message : t("demo.scenarios.switchErrorDetail"),
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    try {
      await resetDemo.mutateAsync();
      toast({
        title: t("demo.scenarios.resetSuccess"),
        description: t("demo.scenarios.resetSuccessDetail"),
      });
    } catch (e) {
      toast({
        title: t("demo.scenarios.resetError"),
        description: e instanceof Error ? e.message : t("demo.scenarios.resetErrorDetail"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{t("demo.scenarios.title")}</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("demo.scenarios.subtitle")}</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void handleReset()}>
          {resetDemo.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          {t("demo.scenarios.resetAll")}
        </Button>
      </div>

      {error ? <DashboardErrorBanner message={(error as Error).message} /> : null}

      {status?.active_scenario_label ? (
        <DashboardCard className="p-4">
          <p className="text-sm font-medium">{t("demo.scenarios.activeScenario")}</p>
          <p className="mt-1 text-lg font-semibold">{status.active_scenario_label}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
            {status.suggested_login_email ? (
              <span>
                {t("demo.scenarios.suggestedLogin")}: <code>{status.suggested_login_email}</code>
              </span>
            ) : null}
            {status.last_seed_at ? (
              <span>
                {t("demo.scenarios.lastSeed")}: {new Date(status.last_seed_at).toLocaleString()}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("demo.scenarios.passwordHint")}</p>
        </DashboardCard>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((scenario) => {
            const isActive = status?.active_scenario === scenario.code;
            return (
              <DashboardCard key={scenario.code} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-snug">{scenario.label}</h2>
                  {isActive ? <Badge variant="secondary">{t("demo.scenarios.active")}</Badge> : null}
                </div>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{scenario.description}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("demo.scenarios.loginAs")}: <code>{scenario.suggested_login_email}</code>
                </p>
                <Button
                  className="mt-4 w-full"
                  disabled={busy || isActive}
                  onClick={() => void handleSwitch(scenario.code)}
                >
                  {switchScenario.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {isActive ? t("demo.scenarios.current") : t("demo.scenarios.apply")}
                </Button>
              </DashboardCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
