/**
 * Mounts the production floating panel and composer.
 * Auth stays closed: no session is injected, queries are disabled, and fetch
 * cannot leave 127.0.0.1:54321. This does not send a chat message.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Window } from "happy-dom";

process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "local-panel-mount";

const fetches: string[] = [];

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

describe("floating assistant panel mount", () => {
  after(() => {
    fetches.length = 0;
  });

  it("renders the production panel and keeps the composer closed without a session", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetches.push(url);
      const host = new URL(url, "http://127.0.0.1:54321").host;
      if (host !== "127.0.0.1:54321") {
        throw new Error(`blocked non-local fetch: ${host}`);
      }
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const { supabase } = await import("@/lib/supabase");
    const clientUrl = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ?? "";
    assert.equal(new URL(clientUrl).host, "127.0.0.1:54321");
    const auth = supabase.auth as {
      onAuthStateChange: (callback: (event: string, session: null) => void) => {
        data: { subscription: { unsubscribe: () => void } };
      };
    };
    auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } });
    installDom();
    const { createElement } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { AuthProvider } = await import("@/context/auth-context");
    const { AppShellProvider } = await import("@/context/app-shell-context");
    const { FloatingAiProvider } = await import("@/context/floating-ai-context");
    const { AiTaskProvider } = await import("@/context/ai-task-context");
    const { FloatingAiPanelContent } = await import("@/components/floating-ai/floating-ai-panel-content");
    await import("@/i18n");

    const queryClient = new QueryClient({
      defaultOptions: { queries: { enabled: false, retry: false }, mutations: { retry: false } },
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, {
          client: queryClient,
          children: createElement(AuthProvider, {
            queryClient,
            children: createElement(AppShellProvider, {
              children: createElement(FloatingAiProvider, {
                children: createElement(AiTaskProvider, {
                  children: createElement(FloatingAiPanelContent, { layout: "floating" }),
                }),
              }),
            }),
          }),
        }),
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const dialog = document.querySelector("[role='dialog']");
    const textarea = document.querySelector("textarea");
    const close = document.querySelector("button[aria-label]");
    assert.ok(dialog, "panel dialog should render");
    assert.ok(textarea, "composer textarea should render");
    assert.equal((textarea as HTMLTextAreaElement).disabled, true);
    assert.ok(close, "panel controls should render");
    assert.equal(document.body.textContent?.includes("provider_rate_limit_exceeded"), false);
    assert.equal(document.body.textContent?.includes("A draft quote was saved"), false);
    for (const url of fetches) {
      assert.equal(new URL(url, "http://127.0.0.1:54321").host, "127.0.0.1:54321");
    }

    await act(async () => {
      close?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      root.unmount();
    });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const causes = error instanceof AggregateError ? error.errors : [err];
      for (const cause of causes) {
        const item = cause instanceof Error ? cause : new Error(String(cause));
        console.error("PANEL_MOUNT_CAUSE", item.name, item.message);
        console.error(item.stack?.split("\n").slice(0, 8).join("\n"));
      }
      throw err;
    }
  });
});
