import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

type OmnichannelTenantBannerProps = {
  message: string;
};

export function OmnichannelTenantBanner({ message }: OmnichannelTenantBannerProps) {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function useOmnichannelTenantBannerMessage(whatsAppChannelMismatch: boolean): string | null {
  const { t } = useTranslation("common");
  if (!whatsAppChannelMismatch) return null;
  return t("omnichannel.tenantGuard.whatsAppMismatch");
}
