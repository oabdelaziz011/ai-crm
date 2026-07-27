import { memo } from "react";
import { Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppShell } from "@/context/app-shell-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const AiCopilotDock = memo(function AiCopilotDock() {
  const { t } = useTranslation("common");
  const { copilotOpen, setCopilotOpen } = useAppShell();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-border bg-card transition-[width,opacity] duration-200 ease-out lg:flex",
        "border-s shadow-[-8px_0_32px_-8px_rgba(0,0,0,0.4)]",
        copilotOpen ? "w-[22.5rem] opacity-100" : "w-0 overflow-hidden opacity-0 border-s-0",
      )}
      aria-label={t("appShell.copilot.label")}
      aria-hidden={!copilotOpen}
    >
      {copilotOpen && (
        <>
          <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
              </div>
              <div>
                <span className="text-sm font-semibold">{t("appShell.copilot.title")}</span>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("appShell.copilot.beta")}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
              onClick={() => setCopilotOpen(false)}
              aria-label={t("appShell.copilot.close")}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-5">
              <p className="text-sm font-semibold text-foreground">{t("appShell.copilot.placeholderTitle")}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t("appShell.copilot.placeholderBody")}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("appShell.copilot.suggestions")}
              </p>
              {["appShell.copilot.suggestion1", "appShell.copilot.suggestion2", "appShell.copilot.suggestion3"].map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    disabled
                    className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-start text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    {t(key)}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-border p-5">
            <div
              className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground"
              role="status"
            >
              {t("appShell.copilot.inputPlaceholder")}
            </div>
          </div>
        </>
      )}
    </aside>
  );
});
