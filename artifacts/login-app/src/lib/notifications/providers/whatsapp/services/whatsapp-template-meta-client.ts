/**
 * Meta Graph API client for WABA message templates (list + create).
 * Never logs access tokens.
 */

import { WhatsAppTemplateSetupError } from "@/lib/notifications/providers/whatsapp/services/whatsapp-template-setup-error";

export type MetaListedWhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
};

export type MetaCreatedWhatsAppTemplate = {
  id: string;
  status: string;
  category: string | null;
};

export type ListMetaWhatsAppTemplatesInput = {
  accessToken: string;
  businessAccountId: string;
  apiVersion?: string;
  fetchFn?: typeof fetch;
  maxAttempts?: number;
};

export type CreateMetaWhatsAppTemplateInput = {
  accessToken: string;
  businessAccountId: string;
  apiVersion?: string;
  fetchFn?: typeof fetch;
  maxAttempts?: number;
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  bodyText: string;
  /** Positional example values matching {{1}}..{{n}} in bodyText. */
  bodyExampleValues: string[];
  allowCategoryChange?: boolean;
};

export class WhatsAppTemplateMetaClientError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly metaCode?: number;

  constructor(message: string, code: string, statusCode = 502, metaCode?: number) {
    super(message);
    this.name = "WhatsAppTemplateMetaClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.metaCode = metaCode;
  }
}

function normalizeApiVersion(apiVersion?: string): string {
  return (apiVersion ?? "v21.0").replace(/^\/+|\/+$/g, "") || "v21.0";
}

function assertCredentials(accessToken: string, businessAccountId: string): void {
  if (!businessAccountId.trim()) {
    throw new WhatsAppTemplateMetaClientError(
      "WhatsApp business account id is required for template Graph calls.",
      "waba_missing",
      400,
    );
  }
  if (!accessToken.trim()) {
    throw new WhatsAppTemplateMetaClientError(
      "WhatsApp access token is required for template Graph calls.",
      "token_missing",
      400,
    );
  }
}

function mapGraphPermissionFailure(message: string, status: number, metaCode?: number): never {
  const lower = message.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    metaCode === 10 ||
    metaCode === 190 ||
    metaCode === 200 ||
    /permission|oauth|access token|#10\b|#200\b|whatsapp_business_management/i.test(lower)
  ) {
    throw new WhatsAppTemplateSetupError(
      message || "Meta denied WhatsApp template management permission.",
      "WHATSAPP_TEMPLATE_META_PERMISSION",
      status === 401 || status === 403 ? status : 403,
    );
  }
  throw new WhatsAppTemplateMetaClientError(
    message || `Meta template Graph call failed (${status})`,
    "meta_graph_failed",
    status >= 400 && status < 600 ? status : 502,
    metaCode,
  );
}

async function withRetry<T>(
  maxAttempts: number,
  run: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  const attempts = Math.max(1, Math.min(maxAttempts, 5));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof WhatsAppTemplateMetaClientError &&
        (error.statusCode === 429 || error.statusCode >= 500);
      if (!retryable || attempt >= attempts) throw error;
      const delayMs = Math.min(2000 * 2 ** (attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function listMetaWhatsAppMessageTemplates(
  input: ListMetaWhatsAppTemplatesInput,
): Promise<MetaListedWhatsAppTemplate[]> {
  assertCredentials(input.accessToken, input.businessAccountId);
  const wabaId = input.businessAccountId.trim();
  const token = input.accessToken.trim();
  const apiVersion = normalizeApiVersion(input.apiVersion);
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);

  return withRetry(input.maxAttempts ?? 3, async () => {
    const out: MetaListedWhatsAppTemplate[] = [];
    let url: string | null =
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/message_templates` +
      `?limit=100&fields=${encodeURIComponent("id,name,language,status,category")}`;

    while (url) {
      const response = await fetchFn(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as {
        data?: Array<Record<string, unknown>>;
        paging?: { next?: string };
        error?: { message?: string; code?: number };
      };
      if (!response.ok) {
        mapGraphPermissionFailure(
          body.error?.message ?? `Meta template list failed (${response.status})`,
          response.status,
          body.error?.code,
        );
      }
      for (const row of body.data ?? []) {
        const name = String(row.name ?? "").trim();
        const language = String(row.language ?? "").trim();
        if (!name || !language) continue;
        out.push({
          id: String(row.id ?? "").trim(),
          name,
          language,
          status: String(row.status ?? "UNKNOWN"),
          category: row.category != null ? String(row.category) : null,
        });
      }
      url = body.paging?.next?.trim() ? body.paging.next : null;
    }
    return out;
  });
}

/**
 * Create a UTILITY (or other) message template on the company WABA.
 * Idempotency is enforced by the caller (list-before-create).
 */
export async function createMetaWhatsAppMessageTemplate(
  input: CreateMetaWhatsAppTemplateInput,
): Promise<MetaCreatedWhatsAppTemplate> {
  assertCredentials(input.accessToken, input.businessAccountId);
  const wabaId = input.businessAccountId.trim();
  const token = input.accessToken.trim();
  const apiVersion = normalizeApiVersion(input.apiVersion);
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const name = input.name.trim().toLowerCase();
  const language = input.language.trim();
  if (!name || !language) {
    throw new WhatsAppTemplateMetaClientError(
      "Template name and language are required.",
      "template_payload_invalid",
      400,
    );
  }

  const bodyComponent: Record<string, unknown> = {
    type: "BODY",
    text: input.bodyText,
  };
  if (input.bodyExampleValues.length > 0) {
    bodyComponent.example = { body_text: [input.bodyExampleValues] };
  }

  const payload = {
    name,
    language,
    category: input.category,
    allow_category_change: input.allowCategoryChange !== false,
    components: [bodyComponent],
  };

  return withRetry(input.maxAttempts ?? 3, async () => {
    const response = await fetchFn(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const body = (await response.json()) as {
      id?: string;
      status?: string;
      category?: string;
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    if (!response.ok) {
      // Already exists is treated by caller after re-list; surface clearly here.
      const message = body.error?.message ?? `Meta template create failed (${response.status})`;
      if (/already exists|duplicate/i.test(message)) {
        throw new WhatsAppTemplateMetaClientError(
          message,
          "meta_template_already_exists",
          409,
          body.error?.code,
        );
      }
      mapGraphPermissionFailure(message, response.status, body.error?.code);
    }
    return {
      id: String(body.id ?? "").trim(),
      status: String(body.status ?? "PENDING"),
      category: body.category != null ? String(body.category) : input.category,
    };
  });
}
