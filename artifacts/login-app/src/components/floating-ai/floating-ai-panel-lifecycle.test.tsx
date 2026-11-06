/**
 * Mounts the production floating panel and composer, then drives send, reply,
 * failure, and idempotency through a test-only runtime override.
 * Fetch stays on 127.0.0.1:54321. No live provider call is made.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Window } from "happy-dom";
import type { ChatMessage } from "@/hooks/ai-chat/use-ai-chat-workspace";

process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "local-panel-lifecycle";
process.env.VALUEOR_ENV = "local";
process.env.LOCAL_INTEGRATION_ENABLED = "0";
process.env.ALLOW_LOCAL_EXTERNAL_OUTBOUND = "0";

const fetches: string[] = [];

type Controls = {
  firstGate: Promise<void>;
  releaseHold: (() => void) | null;
  sends: string[];
  newConversationCount: number;
};

function installDom() {
  const win = new Window({ url: "http://127.0.0.1:5173/dashboard" });
  const define = (key: string, value: unknown) => {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  define("window", win);
  define("document", win.document);
  define("location", win.location);
  define("history", win.history);
  define("addEventListener", win.addEventListener.bind(win));
  define("removeEventListener", win.removeEventListener.bind(win));
  define("dispatchEvent", win.dispatchEvent.bind(win));
  define("HTMLElement", win.HTMLElement);
  define("localStorage", win.localStorage);
  define("sessionStorage", win.sessionStorage);
  define("MutationObserver", win.MutationObserver);
  define("getComputedStyle", win.getComputedStyle.bind(win));
  define("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(Date.now()), 0) as unknown as number);
  define("cancelAnimationFrame", (id: number) => clearTimeout(id));
  define("IS_REACT_ACT_ENVIRONMENT", true);
}

function button(label: string): HTMLButtonElement | null {
  return [...document.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === label,
  ) as HTMLButtonElement | null;
}

function setComposerText(value: string) {
  const textarea = document.querySelector("textarea") as HTMLTextAreaElement | null;
  assert.ok(textarea, "composer textarea should render");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new window.Event("input", { bubbles: true }));
}

describe("floating assistant panel lifecycle", () => {
  after(() => {
    fetches.length = 0;
  });

  it("sends through the composer, renders one reply, and fails closed", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetches.push(url);
      const host = new URL(url, "http://127.0.0.1:54321").host;
      if (host !== "127.0.0.1:54321") throw new Error(`blocked non-local fetch: ${host}`);
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const { supabase } = await import("@/lib/supabase");
    const clientUrl = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ?? "";
    assert.equal(new URL(clientUrl).host, "127.0.0.1:54321");
    installDom();

    const { createElement, useEffect, useRef, useState } = await import("react");
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const {
      AuthActionsContext,
      PermissionsContext,
      SessionContext,
      UserContext,
    } = await import("@/context/auth-context");
    const { AppShellProvider } = await import("@/context/app-shell-context");
    const { FloatingAiProvider } = await import("@/context/floating-ai-context");
    const { AiTaskProvider } = await import("@/context/ai-task-context");
    const { FloatingAiRuntimeOverrideProvider } = await import("@/hooks/floating-ai/floating-ai-runtime-override");
    const { FloatingAiPanelContent } = await import("@/components/floating-ai/floating-ai-panel-content");
    const i18n = (await import("@/i18n")).default;
    await i18n.changeLanguage("en");

    let releaseFirst = () => {};
    const controls: Controls = {
      firstGate: new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }),
      releaseHold: null,
      sends: [],
      newConversationCount: 0,
    };

    function LifecycleHarness() {
      const mounted = useRef(true);
      const waitedForFirst = useRef(false);
      const replies = useRef(new Set<string>());
      const [isSending, setIsSending] = useState(false);
      const [sendError, setSendError] = useState<string | null>(null);
      const [messages, setMessages] = useState<ChatMessage[]>([]);

      useEffect(() => () => {
        mounted.current = false;
      }, []);

      const sendMessage = async (text: string) => {
        controls.sends.push(text);
        setIsSending(true);
        setSendError(null);
        if (!waitedForFirst.current) {
          waitedForFirst.current = true;
          await controls.firstGate;
        }
        if (text === "hold") {
          await new Promise<void>((resolve) => {
            controls.releaseHold = resolve;
          });
        }
        if (!mounted.current) return;
        if (text === "persist-fail") {
          setSendError("The assistant reply could not be saved.");
          setIsSending(false);
          return;
        }
        if (text === "provider-fail") {
          setSendError("channel_route_failed");
          setIsSending(false);
          return;
        }
        if (replies.current.has(text)) {
          setIsSending(false);
          return;
        }
        replies.current.add(text);
        const content = text === "draft-please"
          ? "A draft quote was saved. It was not sent."
          : "Thanks, I can help with that.";
        const externalMessageId = `assistant-reply:${text}`;
        setMessages((current) => [
          ...current,
          { id: `user-${text}`, role: "user", content: text, createdAt: "2026-01-01T00:00:00.000Z" },
          {
            id: externalMessageId,
            role: "assistant",
            content,
            createdAt: "2026-01-01T00:00:01.000Z",
            externalMessageId,
          },
        ]);
        setIsSending(false);
      };

      const startNewConversation = async () => {
        controls.newConversationCount += 1;
        replies.current.clear();
        setMessages([]);
        setSendError(null);
      };

      return createElement(FloatingAiRuntimeOverrideProvider, {
        value: {
          assistantName: "Assistant",
          displayMessages: messages,
          isLoading: false,
          isSending,
          sendError,
          sendMessage,
          startNewConversation,
          streamingContent: "",
          runtimeConfig: {
            providerConnectionId: "local-fake-provider",
            knowledgeRetrieval: null,
            ready: true,
            missing: [],
            platformProviderReady: true,
            errorCode: null,
          },
        },
        children: createElement(FloatingAiPanelContent, { layout: "floating" }),
      });
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const company = {
      id: "company-panel",
      name: "Local Panel",
      logo_url: null,
      status: "active",
      subscription_status: null,
      billing_cycle: null,
      subscription_expires_at: null,
    };
    const profile = {
      id: "user-panel",
      company_id: company.id,
      full_name: "Panel Tester",
      is_super_admin: true,
      preferred_language: "en",
      preferred_theme: null,
      timezone: null,
      avatar_url: null,
    };
    const user = { id: profile.id, email: "panel@local.test" };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    const click = (label: string) => {
      const target = button(label);
      assert.ok(target, `${label} should render`);
      target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    };

    try {
      await act(async () => {
        root.render(
          createElement(QueryClientProvider, {
            client: queryClient,
            children: createElement(SessionContext.Provider, {
              value: { session: { user } as never, user: user as never, isLoading: false },
              children: createElement(UserContext.Provider, {
                value: { profile, company, displayName: "Panel Tester", isSuperAdmin: true },
                children: createElement(PermissionsContext.Provider, {
                  value: { roles: [], permissions: [], isRefreshing: false },
                  children: createElement(AuthActionsContext.Provider, {
                    value: {
                      signIn: async () => ({ error: null }),
                      signUp: async () => ({ error: null, needsEmailConfirmation: false, session: null }),
                      signOut: async () => {},
                      refreshAuthContext: async () => {},
                      applyCompanyMembership: () => {},
                    },
                    children: createElement(AppShellProvider, {
                      children: createElement(FloatingAiProvider, {
                        children: createElement(AiTaskProvider, {
                          children: createElement(LifecycleHarness),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        );
      });

      const textarea = document.querySelector("textarea") as HTMLTextAreaElement | null;
      assert.ok(document.querySelector("[role='dialog']"), "panel dialog should render");
      assert.ok(textarea, "composer textarea should render");
      assert.equal(textarea.disabled, false);

      await act(async () => {
        setComposerText("hello from the panel");
      });
      await act(async () => {
        click("Send message");
        click("Send message");
      });
      assert.equal(controls.sends.length, 1);
      assert.equal((document.querySelector("textarea") as HTMLTextAreaElement).disabled, true);

      await act(async () => {
        releaseFirst();
        await controls.firstGate;
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const assistant = document.querySelectorAll("[data-message-role='assistant']");
      assert.equal(assistant.length, 1);
      assert.equal(assistant[0]?.textContent?.includes("Thanks, I can help with that."), true);
      assert.equal(document.querySelectorAll("[data-external-message-id='assistant-reply:hello from the panel']").length, 1);
      assert.equal((document.querySelector("textarea") as HTMLTextAreaElement).disabled, false);

      await act(async () => {
        setComposerText("hello from the panel");
      });
      await act(async () => {
        click("Send message");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(document.querySelectorAll("[data-message-role='assistant']").length, 1);
      assert.equal(controls.sends.filter((text) => text === "hello from the panel").length, 2);

      await act(async () => {
        setComposerText("persist-fail");
      });
      await act(async () => {
        click("Send message");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(document.body.textContent?.includes("The assistant reply could not be saved."), true);
      assert.equal(document.querySelectorAll("[data-message-role='assistant']").length, 1);
      assert.equal(document.body.textContent?.includes("A draft quote was saved"), false);

      await act(async () => {
        setComposerText("provider-fail");
      });
      await act(async () => {
        click("Send message");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(document.body.textContent?.includes("The message could not be delivered to the AI runtime."), true);
      assert.equal(document.body.textContent?.includes("provider_rate_limit_exceeded"), false);
      assert.equal(document.querySelectorAll("[data-message-role='assistant']").length, 1);

      await act(async () => {
        setComposerText("draft-please");
      });
      await act(async () => {
        click("Send message");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      assert.equal(document.body.textContent?.includes("A draft quote was saved. It was not sent."), true);
      assert.equal(document.body.textContent?.includes("quote was sent"), false);
      assert.equal(document.querySelectorAll("[data-message-role='assistant']").length, 2);

      await act(async () => {
        click("New conversation");
      });
      assert.equal(controls.newConversationCount, 1);
      assert.equal(document.querySelectorAll("[data-message-role='assistant']").length, 0);

      await act(async () => {
        click("Minimize assistant");
      });
      assert.equal(window.localStorage.getItem("valueor.floating-ai.panel-minimized"), "true");

      await act(async () => {
        click("Close assistant");
      });

      await act(async () => {
        setComposerText("hold");
      });
      await act(async () => {
        click("Send message");
      });
      await act(async () => {
        root.unmount();
        controls.releaseHold?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      for (const url of fetches) {
        assert.equal(new URL(url, "http://127.0.0.1:54321").host, "127.0.0.1:54321");
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const causes = error instanceof AggregateError ? error.errors : [err];
      for (const cause of causes) {
        const item = cause instanceof Error ? cause : new Error(String(cause));
        console.error("PANEL_LIFECYCLE_CAUSE", item.name, item.message);
        console.error(item.stack?.split("\n").slice(0, 8).join("\n"));
      }
      throw err;
    }
  });
});
