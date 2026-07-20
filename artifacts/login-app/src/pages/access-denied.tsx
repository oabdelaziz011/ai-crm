import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useRbacDeveloperMode } from "@/hooks/use-rbac-developer-mode";
import {
  resolvePermissionDescription,
  resolvePermissionDisplayName,
  usePermissionCatalogLanguageVersion,
} from "@/lib/rbac/permission-display-i18n";

export default function AccessDeniedPage({ requiredPermission }: { requiredPermission?: string }) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { developerMode } = useRbacDeveloperMode();
  usePermissionCatalogLanguageVersion();

  const permissionLabel =
    requiredPermission && requiredPermission !== "super_admin" && requiredPermission !== "access"
      ? resolvePermissionDisplayName(requiredPermission)
      : requiredPermission === "super_admin"
        ? t("pages.accessDenied.superAdminRequired")
        : null;

  const permissionDescription =
    requiredPermission && requiredPermission !== "super_admin" && requiredPermission !== "access"
      ? resolvePermissionDescription(requiredPermission)
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-card/60 p-8 text-center shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">{t("pages.accessDenied.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("pages.accessDenied.description")}
          {permissionLabel ? (
            <>
              {" "}
              {t("pages.accessDenied.requiredPermissionLabel", { permission: permissionLabel })}
            </>
          ) : null}
        </p>
        {developerMode && permissionDescription ? (
          <p className="mt-2 text-xs text-muted-foreground">{permissionDescription}</p>
        ) : null}
        {developerMode && requiredPermission && requiredPermission !== "super_admin" ? (
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/80" dir="ltr">
            {requiredPermission}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => setLocation("/dashboard")} className="bg-primary/20 text-primary hover:bg-primary/30">
            {t("pages.accessDenied.back")}
          </Button>
        </div>
      </div>
    </div>
  );
}
