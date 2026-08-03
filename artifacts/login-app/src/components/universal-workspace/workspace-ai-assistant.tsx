import { memo, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspacePlatformOptional } from "@/context/workspace-platform-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const WorkspaceAiAssistant = memo(function WorkspaceAiAssistant() {
  const { t } = useTranslation("common");
  const platform = useWorkspacePlatformOptional();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const capabilities = [
    { key: "copilot.summarize", label: t("workspacePlatform.copilot.summarize") },
    { key: "copilot.explain", label: t("workspacePlatform.copilot.explain") },
    { key: "copilot.email", label: t("workspacePlatform.copilot.email") },
    { key: "copilot.whatsapp", label: t("workspacePlatform.copilot.whatsapp") },
    { key: "copilot.overdue", label: t("workspacePlatform.copilot.overdue") },
    { key: "copilot.nextAction", label: t("workspacePlatform.copilot.nextAction") },
  ];

  const contextLabel = platform?.workspaceContext.entityLabel ?? t("workspacePlatform.copilot.context");

  return (
    <>
      <Button
        size="icon"
        className={cn(
          "fixed bottom-6 end-6 z-50 size-12 rounded-full shadow-lg transition-transform hover:scale-105",
          open && "ring-2 ring-primary/40",
        )}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("workspacePlatform.copilot.title")}
      >
        <Bot className="size-5" />
      </Button>

      {open && (
        <div className="fixed bottom-20 end-6 z-50 w-80 animate-in slide-in-from-bottom-4 fade-in rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur-md">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <div>
              <p className="text-xs font-semibold">{t("workspacePlatform.copilot.title")}</p>
              <p className="text-[10px] text-muted-foreground">{contextLabel}</p>
            </div>
          </div>

          {draft ? (
            <div className="space-y-2">
              <p className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed">{draft}</p>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 flex-1 text-[10px]" disabled>
                  {t("workspacePlatform.copilot.confirm")}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setDraft(null)}>
                  {t("workspacePlatform.copilot.discard")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {capabilities.map((cap) => (
                <button
                  key={cap.key}
                  type="button"
                  onClick={() => setDraft(`${cap.label} — ${t("workspacePlatform.copilot.preview")}`)}
                  className="rounded-lg border border-border/40 px-2 py-2 text-start text-[10px] font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {cap.label}
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 text-[9px] text-muted-foreground">{t("workspacePlatform.copilot.disclaimer")}</p>
        </div>
      )}
    </>
  );
});
