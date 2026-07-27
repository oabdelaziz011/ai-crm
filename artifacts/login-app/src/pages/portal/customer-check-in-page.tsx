import { useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { usePortalCheckIn } from "@/lib/customer-portal/hooks";

type CustomerCheckInPageProps = Record<string, never>;

export function CustomerCheckInPage(_props: CustomerCheckInPageProps) {
  const [, params] = useRoute("/check-in/:token");
  const token = params?.token ?? "";
  const { t } = useTranslation("common");
  const checkIn = usePortalCheckIn();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-bold">{t("customerPortal.checkInTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("customerPortal.checkInDescription")}</p>
      {checkIn.isSuccess ? (
        <p className="text-lg font-medium text-emerald-400">{t("customerPortal.checkInSuccess")}</p>
      ) : (
        <Button
          size="lg"
          disabled={checkIn.isPending}
          onClick={() => checkIn.mutate(token)}
        >
          {t("customerPortal.imHere")}
        </Button>
      )}
      {checkIn.isError ? (
        <p className="text-sm text-rose-400">{t("customerPortal.checkInFailed")}</p>
      ) : null}
    </div>
  );
}
