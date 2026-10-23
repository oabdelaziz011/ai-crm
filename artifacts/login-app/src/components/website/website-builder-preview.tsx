import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WebsiteVisitorBody, type WebsiteVisitorModel } from "@/components/website/website-visitor-body";
import type { WebsiteBodySectionKey } from "@/lib/website/website-model";

export type { WebsitePreviewHour, WebsitePreviewService } from "@/components/website/website-visitor-body";
export { orderedPreviewHours } from "@/components/website/website-visitor-body";

export type WebsiteBuilderPreviewModel = WebsiteVisitorModel & {
  greeting: string;
  urlLabel: string;
};

export function WebsiteBuilderPreview({ model, onBook, onReorder, editor, viewport = "desktop", framed = true }: { model: WebsiteBuilderPreviewModel; onBook?: (serviceId: string | null) => void; onReorder?: (from: WebsiteBodySectionKey, to: WebsiteBodySectionKey) => void; editor?: ComponentProps<typeof WebsiteVisitorBody>["editor"]; viewport?: "desktop" | "tablet" | "mobile"; framed?: boolean }) {
  const { t } = useTranslation("common");
  const [chatOpen, setChatOpen] = useState(false);
  const frame = viewport === "mobile" ? "max-w-[390px]" : viewport === "tablet" ? "max-w-[768px]" : "max-w-none";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      {framed ? <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="size-2 rounded-full bg-muted-foreground/30" />
        <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
          {model.urlLabel}
        </span>
        {model.sections.chat ? null : (
          <span className="shrink-0 text-xs text-muted-foreground">{t("websiteBuilder.builder.chatOffPreview")}</span>
        )}
      </div> : null}
      <div className="relative min-h-0 flex-1 bg-muted/40">
        <div className="h-full overflow-y-auto">
          <div className={`mx-auto min-h-full bg-background ${frame}`}>
            <WebsiteVisitorBody model={model} mode="preview" onBook={onBook} onReorder={onReorder} editor={editor} />
          </div>
        </div>
        {model.sections.chat && model.content.chat.anchor !== "flow" ? (
          <div className={`absolute bottom-4 z-10 flex flex-col gap-2 ${model.content.chat.side === "start" ? "start-4 items-start" : "end-4 items-end"}`}>
            {chatOpen ? (
              <section className="w-[min(100vw-2rem,22rem)] overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-xl">
                <header className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
                  <span className="text-sm font-semibold">{t("websiteBuilder.visitor.chatTitle")}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                    onClick={() => setChatOpen(false)}
                    aria-label={t("websiteBuilder.visitor.close")}
                  >
                    <X className="size-4" />
                  </Button>
                </header>
                <p className="px-4 py-4 text-sm leading-6 text-muted-foreground">
                  {model.greeting || t("websiteBuilder.visitor.assistant")}
                </p>
                <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                  {t("websiteBuilder.builder.chatPreviewNote")}
                </p>
              </section>
            ) : null}
            <Button
              type="button"
              size="icon"
              className="size-14 rounded-full shadow-lg"
              onClick={() => setChatOpen((open) => !open)}
              aria-label={t("websiteBuilder.visitor.chatTitle")}
            >
              <MessageCircle className="size-6" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
