import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InboxChannelBadge } from "@/components/conversations/inbox-channel-badge";
import { buildTicketResolutionMessage } from "@/lib/tickets/ticket-origin-channel";
import {
  requestTicketResolutionAiDraft,
  TicketResolutionAiAuthError,
  type TicketResolutionAiLanguage,
  type TicketResolutionAiMode,
} from "@/lib/tickets/ticket-resolution-ai-write";
import { noteNestedOverlayActivity } from "@/lib/ui/prevent-dialog-dismiss-for-nested-overlay";
import { cn } from "@/lib/utils";

export type TicketCloseNotifyPhase = "ask" | "compose";

function messageDir(language: TicketResolutionAiLanguage): "rtl" | "ltr" {
  return language === "ar" ? "rtl" : "ltr";
}

export function TicketCloseNotifyDialog({
  open,
  phase,
  companyId,
  ticketId,
  conversationId,
  ticketNumber,
  customerName,
  channelType,
  channelLabel,
  canNotifyOnChannel,
  messagingWindowHint,
  pending,
  onPhaseChange,
  onConfirmWithoutNotify,
  onConfirmWithNotify,
  onCancel,
}: {
  open: boolean;
  phase: TicketCloseNotifyPhase;
  companyId: string | null;
  ticketId: string;
  conversationId?: string | null;
  ticketNumber: string;
  customerName: string | null;
  channelType: string | null;
  channelLabel: string;
  canNotifyOnChannel: boolean;
  messagingWindowHint?: string | null;
  pending: boolean;
  onPhaseChange: (phase: TicketCloseNotifyPhase) => void;
  onConfirmWithoutNotify: () => void;
  onConfirmWithNotify: (message: string) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation("common");
  const defaultMessage = useMemo(
    () =>
      buildTicketResolutionMessage({
        ticketNumber,
        customerName,
        template: t("tickets.closeNotify.template"),
      }),
    [ticketNumber, customerName, t],
  );

  const [message, setMessage] = useState(defaultMessage);
  const [messageLanguage, setMessageLanguage] = useState<TicketResolutionAiLanguage>("en");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiSource, setAiSource] = useState<"ai" | "template" | "manual">("template");
  const [aiHint, setAiHint] = useState<string | null>(null);
  const generationSeq = useRef(0);
  const sendLock = useRef(false);

  const busy = pending || aiGenerating;

  useEffect(() => {
    if (!open || phase !== "compose") return;
    // Seed customer-message language from UI locale once per compose open (independent thereafter).
    const uiLang: TicketResolutionAiLanguage = (i18n.language ?? "en")
      .toLowerCase()
      .startsWith("ar")
      ? "ar"
      : "en";
    setMessageLanguage(uiLang);
    setMessage(defaultMessage);
    setAiSource("template");
    setAiHint(null);
    sendLock.current = false;

    if (!companyId || !ticketId) return;

    let cancelled = false;
    const seq = ++generationSeq.current;

    const run = async () => {
      setAiGenerating(true);
      setAiHint(null);
      try {
        const draft = await requestTicketResolutionAiDraft({
          companyId,
          ticketId,
          conversationId,
          outputLanguage: uiLang,
          mode: "generate",
          fallbackTemplate: defaultMessage,
          currentDraft: "",
        });
        if (cancelled || seq !== generationSeq.current) return;
        if (draft.body.trim()) {
          setMessage(draft.body);
          setAiSource("ai");
          setAiHint(null);
        } else {
          setMessage(defaultMessage);
          setAiSource("template");
          setAiHint(t("tickets.closeNotify.aiFallbackHint"));
        }
      } catch (err) {
        if (cancelled || seq !== generationSeq.current) return;
        setMessage(defaultMessage);
        setAiSource("template");
        if (err instanceof TicketResolutionAiAuthError) {
          setAiHint(t("tickets.closeNotify.aiSessionExpired"));
        } else {
          setAiHint(t("tickets.closeNotify.aiFallbackHint"));
        }
      } finally {
        if (!cancelled && seq === generationSeq.current) {
          setAiGenerating(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, phase, companyId, ticketId, conversationId, defaultMessage, i18n.language, t]);

  const regenerate = async (mode: TicketResolutionAiMode, language: TicketResolutionAiLanguage) => {
    if (!companyId || !ticketId || aiGenerating || pending) return;
    const seq = ++generationSeq.current;
    setAiGenerating(true);
    setAiHint(null);
    try {
      const draft = await requestTicketResolutionAiDraft({
        companyId,
        ticketId,
        conversationId,
        outputLanguage: language,
        mode,
        fallbackTemplate: defaultMessage,
        currentDraft: message,
      });
      if (seq !== generationSeq.current) return;
      if (draft.body.trim()) {
        setMessage(draft.body);
        setAiSource("ai");
        setAiHint(null);
      } else {
        setMessage(defaultMessage);
        setAiSource("template");
        setAiHint(t("tickets.closeNotify.aiFallbackHint"));
      }
    } catch (err) {
      if (seq !== generationSeq.current) return;
      setMessage(defaultMessage);
      setAiSource("template");
      if (err instanceof TicketResolutionAiAuthError) {
        setAiHint(t("tickets.closeNotify.aiSessionExpired"));
      } else {
        setAiHint(t("tickets.closeNotify.aiFallbackHint"));
      }
    } finally {
      if (seq === generationSeq.current) {
        setAiGenerating(false);
      }
    }
  };

  const handleLanguageChange = (next: TicketResolutionAiLanguage) => {
    setMessageLanguage(next);
    void regenerate("generate", next);
  };

  const handleSend = () => {
    if (busy || !message.trim() || sendLock.current) return;
    sendLock.current = true;
    onConfirmWithNotify(message.trim());
  };

  const charCount = message.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) onCancel();
        else noteNestedOverlayActivity();
      }}
    >
      <DialogContent className="rounded-2xl sm:max-w-lg" dir={i18n.dir()}>
        {phase === "ask" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("tickets.closeNotify.askTitle", { ticketNumber })}
              </DialogTitle>
              <DialogDescription>{t("tickets.closeNotify.askBody")}</DialogDescription>
            </DialogHeader>
            {!canNotifyOnChannel ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
                {t("tickets.closeNotify.noChannelHint")}
              </p>
            ) : null}
            {messagingWindowHint ? (
              <p className="text-xs text-muted-foreground">{messagingWindowHint}</p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-2 sm:flex-col sm:space-x-0">
              <Button
                type="button"
                className="rounded-xl gap-2"
                disabled={pending || !canNotifyOnChannel}
                onClick={() => onPhaseChange("compose")}
                data-testid="ticket-close-and-notify"
              >
                {t("tickets.closeNotify.closeAndNotify")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={pending}
                onClick={onConfirmWithoutNotify}
                data-testid="ticket-close-without-notify"
              >
                {t("tickets.closeNotify.closeWithoutNotify")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                disabled={pending}
                onClick={onCancel}
              >
                {t("tickets.closeNotify.cancel")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-muted-foreground" aria-hidden />
                {t("tickets.closeNotify.composeTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("tickets.closeNotify.composeBody", { channel: channelLabel })}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/15 px-3 py-2.5 text-sm sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-muted-foreground">{t("tickets.closeNotify.customerLabel")}</p>
                <p className="truncate font-medium">{customerName || t("tickets.360.noCustomer")}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{t("tickets.closeNotify.ticketLabel")}</p>
                <p dir="ltr" className="font-mono font-medium">
                  {ticketNumber}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">{t("tickets.closeNotify.channelLabel")}</p>
                {channelType ? (
                  <InboxChannelBadge channelType={channelType} size="sm" className="mt-0.5" />
                ) : (
                  <p className="font-medium">{channelLabel}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-close-notify-language">{t("tickets.closeNotify.languageLabel")}</Label>
                <Select
                  value={messageLanguage}
                  onValueChange={(v) => handleLanguageChange(v as TicketResolutionAiLanguage)}
                  disabled={busy}
                >
                  <SelectTrigger
                    id="ticket-close-notify-language"
                    className="w-[160px] rounded-xl"
                    data-testid="ticket-close-notify-language"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t("tickets.closeNotify.languageEn")}</SelectItem>
                    <SelectItem value="ar">{t("tickets.closeNotify.languageAr")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                    aiSource === "ai"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                  data-testid="ticket-close-notify-ai-badge"
                >
                  <Sparkles className="size-3" aria-hidden />
                  {aiSource === "ai"
                    ? t("tickets.closeNotify.aiSuggested")
                    : t("tickets.closeNotify.fallbackTemplate")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl gap-1.5"
                  disabled={busy || !companyId}
                  onClick={() => void regenerate("generate", messageLanguage)}
                  data-testid="ticket-close-notify-regenerate"
                >
                  {aiGenerating ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden />
                  )}
                  {aiGenerating
                    ? t("tickets.closeNotify.aiGenerating")
                    : t("tickets.closeNotify.regenerate")}
                </Button>
              </div>
            </div>

            {aiHint ? (
              <p className="text-xs text-muted-foreground" data-testid="ticket-close-notify-ai-hint">
                {aiHint}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="ticket-close-notify-message">{t("tickets.closeNotify.messageLabel")}</Label>
              <Textarea
                id="ticket-close-notify-message"
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setAiSource("manual");
                }}
                dir={messageDir(messageLanguage)}
                className={cn("min-h-[180px] rounded-xl text-sm leading-relaxed")}
                disabled={busy}
                data-testid="ticket-close-notify-message"
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>{t("tickets.closeNotify.messageHint")}</p>
                <p dir="ltr">{t("tickets.closeNotify.charCount", { count: charCount })}</p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={busy}
                onClick={() => onPhaseChange("ask")}
              >
                {t("tickets.closeNotify.back")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                disabled={busy}
                onClick={onCancel}
              >
                {t("tickets.closeNotify.cancel")}
              </Button>
              <Button
                type="button"
                className="rounded-xl gap-2"
                disabled={busy || !message.trim()}
                onClick={handleSend}
                data-testid="ticket-close-send-and-close"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                {t("tickets.closeNotify.sendAndClose")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
