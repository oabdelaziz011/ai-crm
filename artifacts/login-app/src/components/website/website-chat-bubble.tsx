import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  openWebsiteChatSession,
  pollWebsiteChatMessages,
  sendWebsiteChatMessage,
  websiteChatMessageId,
  type WebsiteChatLine,
  type WebsiteChatSession,
} from "@/lib/website/website-chat-client";

const TOKEN_PREFIX = "valueor-website-chat:";

function readStoredToken(publicKey: string): string | null {
  try {
    return sessionStorage.getItem(`${TOKEN_PREFIX}${publicKey}`);
  } catch {
    return null;
  }
}

function writeStoredToken(publicKey: string, token: string) {
  try {
    sessionStorage.setItem(`${TOKEN_PREFIX}${publicKey}`, token);
  } catch {
    // Private mode can reject storage. The session still works until refresh.
  }
}

export function WebsiteChatBubble({
  apiBaseUrl,
  publicKey,
  greeting,
  assistant,
  anchor = "fixed",
  side = "end",
}: {
  apiBaseUrl: string;
  publicKey: string;
  greeting: string;
  assistant: boolean;
  anchor?: "fixed" | "flow";
  side?: "start" | "end";
}) {
  const { t, i18n } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<WebsiteChatSession | null>(null);
  const [lines, setLines] = useState<WebsiteChatLine[]>([]);
  const [after, setAfter] = useState(0);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(greeting || null);
  const [busy, setBusy] = useState(false);
  const [askedForPerson, setAskedForPerson] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || session) return;
    let cancelled = false;
    void openWebsiteChatSession({
      apiBaseUrl,
      publicKey,
      visitorToken: readStoredToken(publicKey),
      locale: i18n.language,
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setNotice(t("websiteBuilder.visitor.chatUnavailable"));
        return;
      }
      writeStoredToken(publicKey, result.value.visitorToken);
      setSession(result.value);
      if (result.value.greeting) setNotice(result.value.greeting);
    });
    return () => {
      cancelled = true;
    };
  }, [open, session, apiBaseUrl, publicKey, i18n.language, t]);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    const pull = () => {
      void pollWebsiteChatMessages({
        apiBaseUrl,
        sessionId: session.sessionId,
        visitorToken: session.visitorToken,
        after,
      }).then((result) => {
        if (cancelled || !result.ok || result.value.messages.length === 0) return;
        setLines((current) => [...current, ...result.value.messages]);
        setAfter(result.value.nextAfter);
      });
    };
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, session, after, apiBaseUrl]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines, notice]);

  const send = async (message: string, requestHuman = false) => {
    if (!session || busy || !message.trim()) return;
    setBusy(true);
    const result = await sendWebsiteChatMessage({
      apiBaseUrl,
      sessionId: session.sessionId,
      visitorToken: session.visitorToken,
      text: message.trim(),
      clientMessageId: websiteChatMessageId(),
      locale: i18n.language,
      requestHuman,
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(t(`websiteBuilder.visitor.${result.error}`));
      return;
    }
    if (requestHuman) setAskedForPerson(true);
    setText("");
    if (result.value.notice) setNotice(result.value.notice);
  };

  const place = side === "start" ? "start-4 items-start" : "end-4 items-end";
  return (
    <div className={`${anchor === "flow" ? "mx-auto flex w-full max-w-6xl px-4 pb-8" : `fixed bottom-4 z-40 ${place}`} flex flex-col gap-3`}>
      {open ? (
        <section className={`flex h-[min(28rem,70vh)] w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-3xl border bg-background shadow-xl ${side === "end" ? "ms-auto" : ""}`}>
          <header className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">{t("websiteBuilder.visitor.chatTitle")}</p>
              {assistant ? (
                <p className="text-xs text-primary-foreground/80">{t("websiteBuilder.visitor.assistant")}</p>
              ) : null}
            </div>
            <Button type="button" size="icon" variant="ghost" className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground" onClick={() => setOpen(false)} aria-label={t("websiteBuilder.visitor.close")}>
              <X className="size-4" />
            </Button>
          </header>
          <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
            {lines.map((line) => (
              <p
                key={line.sequence}
                className={
                  line.sender === "visitor"
                    ? "ms-8 rounded-2xl rounded-ee-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "me-8 rounded-2xl rounded-es-md bg-muted px-3 py-2 text-sm"
                }
              >
                {line.text}
              </p>
            ))}
          </div>
          <form
            className="flex flex-col gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(text);
            }}
          >
            <label className="sr-only" htmlFor="website-chat-text">
              {t("websiteBuilder.visitor.message")}
            </label>
            <textarea
              id="website-chat-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder={t("websiteBuilder.visitor.message")}
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!session || busy || askedForPerson}
                onClick={() => void send(t("websiteBuilder.visitor.askPersonMessage"), true)}
              >
                {t("websiteBuilder.visitor.askPerson")}
              </Button>
              <Button type="submit" size="sm" disabled={!session || busy || !text.trim()}>
                {t("websiteBuilder.visitor.send")}
              </Button>
            </div>
          </form>
        </section>
      ) : null}
      <Button type="button" size="icon" className={`size-14 rounded-full shadow-lg ${side === "end" ? "ms-auto" : ""}`} onClick={() => setOpen((value) => !value)} aria-label={t("websiteBuilder.visitor.chatTitle")}>
        <MessageCircle className="size-6" />
      </Button>
    </div>
  );
}
