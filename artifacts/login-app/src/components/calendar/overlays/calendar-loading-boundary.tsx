import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type CalendarLoadingBoundaryProps = {
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  children: ReactNode;
};

export function CalendarLoadingBoundary({
  isLoading,
  error,
  onRetry,
  children,
}: CalendarLoadingBoundaryProps) {
  const { t } = useTranslation("common");

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <p className="text-sm text-rose-300">{error.message}</p>
        {onRetry && (
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={onRetry}
          >
            {t("calendar.errors.retry")}
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t("calendar.loading")}</span>
      </div>
    );
  }

  return <div className="h-full min-h-0">{children}</div>;
}
