import { useAuth } from "@/context/auth-context";
import { useTranslation } from "react-i18next";

export function ProfilesSection() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("profiles.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("profiles.subtitle")}</p>
      </div>
      <div className="rounded-lg border border-white/10 bg-card/40 p-6">
        <p className="text-sm text-muted-foreground">{t("profiles.current", { id: profile?.id ?? "-" })}</p>
      </div>
    </div>
  );
}
