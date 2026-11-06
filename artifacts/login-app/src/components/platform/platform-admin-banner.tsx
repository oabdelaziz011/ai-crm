import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  closePlatformCompanyContext,
  loadLivePlatformAdminContext,
  platformAdminUrl,
  prepareAdminHostHandoff,
  type StoredPlatformAdminContext,
} from "@/lib/platform/platform-admin-context";

export function PlatformAdminBanner() {
  const { t } = useTranslation("common");
  const [context, setContext] = useState<StoredPlatformAdminContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLivePlatformAdminContext().then((value) => {
      if (!cancelled) setContext(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!context) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-foreground"
      role="status"
      data-testid="platform-admin-banner"
    >
      <p>{t("platformAdmin.banner", { company: context.companyName })}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const target = platformAdminUrl(context.returnOrigin);
          void closePlatformCompanyContext(context.id)
            .catch(() => undefined)
            .then(() => prepareAdminHostHandoff(null))
            .finally(() => {
              window.location.assign(target);
            });
        }}
      >
        {t("platformAdmin.exit")}
      </Button>
    </div>
  );
}
