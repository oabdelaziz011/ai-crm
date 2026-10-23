export type WebsiteChatLine = {
  sequence: number;
  sender: string;
  text: string;
};

export type WebsiteChatSession = {
  sessionId: string;
  visitorToken: string;
  greeting: string;
};

type ChatResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: "unavailable" | "invalid" | "rate_limited" };

function apiBase(raw: string): string {
  return raw.replace(/\/$/, "");
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => ({}))) as unknown;
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function failure(status: number): ChatResult<never> {
  if (status === 429) return { ok: false, error: "rate_limited" };
  if (status === 400 || status === 413) return { ok: false, error: "invalid" };
  return { ok: false, error: "unavailable" };
}

export async function openWebsiteChatSession(input: {
  apiBaseUrl: string;
  publicKey: string;
  visitorToken?: string | null;
  locale?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<ChatResult<WebsiteChatSession>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBase(input.apiBaseUrl)}/api/public/web-chat/${input.publicKey}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "omit",
    body: JSON.stringify({
      ...(input.visitorToken ? { visitor_token: input.visitorToken } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
    }),
  });
  const body = await readJson(response);
  if (!response.ok) return failure(response.status);
  const session = body.session && typeof body.session === "object" ? (body.session as Record<string, unknown>) : null;
  const sessionId = typeof session?.id === "string" ? session.id : null;
  const token = typeof body.visitorToken === "string"
    ? body.visitorToken
    : input.visitorToken ?? null;
  const widget = body.widget && typeof body.widget === "object" ? (body.widget as Record<string, unknown>) : {};
  if (!sessionId || !token) return { ok: false, error: "unavailable" };
  return {
    ok: true,
    value: {
      sessionId,
      visitorToken: token,
      greeting: typeof widget.greeting === "string" ? widget.greeting : "",
    },
  };
}

export function websiteChatMessageId(): string {
  const bytes = crypto.randomUUID().replace(/-/g, "");
  return `site${bytes}`.slice(0, 40);
}

export async function sendWebsiteChatMessage(input: {
  apiBaseUrl: string;
  sessionId: string;
  visitorToken: string;
  text: string;
  clientMessageId: string;
  locale?: string | null;
  requestHuman?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ChatResult<{ status: string; notice: string | null }>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${apiBase(input.apiBaseUrl)}/api/public/web-chat/sessions/${input.sessionId}/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${input.visitorToken}`,
      },
      credentials: "omit",
      body: JSON.stringify({
        client_message_id: input.clientMessageId,
        text: input.text,
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.requestHuman ? { request_human: true } : {}),
      }),
    },
  );
  const body = await readJson(response);
  if (!response.ok) return failure(response.status);
  return {
    ok: true,
    value: {
      status: typeof body.status === "string" ? body.status : "accepted",
      notice: typeof body.notice === "string" ? body.notice : null,
    },
  };
}

export async function pollWebsiteChatMessages(input: {
  apiBaseUrl: string;
  sessionId: string;
  visitorToken: string;
  after: number;
  fetchImpl?: typeof fetch;
}): Promise<ChatResult<{ messages: WebsiteChatLine[]; nextAfter: number }>> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${apiBase(input.apiBaseUrl)}/api/public/web-chat/sessions/${input.sessionId}/messages?after=${input.after}`,
    {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.visitorToken}`,
      },
      credentials: "omit",
    },
  );
  const body = await readJson(response);
  if (!response.ok) return failure(response.status);
  const messages = Array.isArray(body.messages)
    ? body.messages.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        if (typeof row.text !== "string" || typeof row.sequence !== "number") return [];
        return [{ sequence: row.sequence, sender: typeof row.sender === "string" ? row.sender : "agent", text: row.text }];
      })
    : [];
  return {
    ok: true,
    value: {
      messages,
      nextAfter: typeof body.nextAfter === "number" ? body.nextAfter : input.after,
    },
  };
}
