import { memo, useState } from "react";
import { MessageCircle, Sparkles, X } from "lucide-react";
import type { CopilotCapability } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export const IntelligenceFloatingCopilot = memo(function IntelligenceFloatingCopilot({
  capabilities,
}: {
  capabilities: CopilotCapability[];
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="pointer-events-none absolute bottom-4 end-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto w-72 rounded-2xl border border-primary/25 bg-card/95 p-3 shadow-xl backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <span className="text-xs font-semibold">{t("intelligence.copilot.title")}</span>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setOpen(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          {draft ? (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-2 text-[11px] leading-relaxed text-muted-foreground">
              {draft}
              <div className="mt-2 flex gap-1">
                <Button size="sm" className="h-7 flex-1 text-[10px]" disabled>{t("intelligence.copilot.confirm")}</Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setDraft(null)}>{t("intelligence.copilot.discard")}</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-1">
              {capabilities.map((cap) => (
                <Button
                  key={cap.id}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start text-[11px]"
                  onClick={() => setDraft(t(`intelligence.${cap.labelKey}`) + " — " + t("intelligence.copilot.preview"))}
                >
                  {t(`intelligence.${cap.labelKey}`)}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      <Button
        size="icon"
        className={cn("pointer-events-auto size-12 rounded-full shadow-lg", open && "ring-2 ring-primary/30")}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </Button>
    </div>
  );
});
