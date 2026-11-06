import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { parseCompanyHost } from "@/lib/platform/company-subdomain";

type GateState = "checking" | "ok" | "denied";

function reasonKey(reason: string): "unknownHost" | "inactive" | "forbidden" {
  if (reason === "unknown_host") return "unknownHost";
  if (reason === "inactive") return "inactive";
  return "forbidden";
}

export function TenantHostGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const host = typeof window === "undefined" ? "" : window.location.hostname;
  const isTenantHost = parseCompanyHost(host).kind === "tenant";
  const [state, setState] = useState<GateState>(isTenantHost ? "checking" : "ok");
  const [reason, setReason] = useState("forbidden");

  useEffect(() => {
    if (!isTenantHost) return;
    let cancelled = false;
    void supabase.rpc("assert_tenant_host_access", { p_host: host }).then(({ data, error }) => {
      if (cancelled) return;
      const value = error ? "forbidden" : String(data ?? "forbidden");
      if (value === "ok" || value === "platform" || value === "ignore") {
        setState("ok");
        return;
      }
      setReason(value);
      setState("denied");
      void supabase.rpc("log_platform_access_denied", { p_event: "tenant_host_denied" });
    });
    return () => {
      cancelled = true;
    };
  }, [host, isTenantHost]);

  if (state === "checking") {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label={t("platformAdmin.deniedTitle")} />
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center" data-testid="tenant-host-denied">
        <h1 className="text-xl font-semibold text-foreground">{t("platformAdmin.deniedTitle")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t(`platformAdmin.${reasonKey(reason)}`)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("platformAdmin.deniedBody")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
