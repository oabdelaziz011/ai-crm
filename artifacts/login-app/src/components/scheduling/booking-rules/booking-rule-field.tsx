import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type BookingRuleFieldProps = {
  titleKey: string;
  helpKey: string;
  tooltipKey?: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
};

export function BookingRuleField({
  titleKey,
  helpKey,
  tooltipKey,
  htmlFor,
  error,
  children,
}: BookingRuleFieldProps) {
  const { t } = useTranslation("common");

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-background/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor={htmlFor} className="text-sm font-medium">
            {t(titleKey)}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">{t(helpKey)}</p>
        </div>
        {tooltipKey && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t(tooltipKey)}
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs leading-relaxed">
                {t(tooltipKey)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function BookingRuleSection({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: string;
  subtitleKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");

  return (
    <section className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold">{t(titleKey)}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{t(subtitleKey)}</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}
