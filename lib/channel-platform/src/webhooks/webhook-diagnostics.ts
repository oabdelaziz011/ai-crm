export type WebhookDiagnosticEvent = {
  stage: string;
  detail?: Record<string, unknown>;
};

export type WebhookDiagnosticLogger = (event: WebhookDiagnosticEvent) => void;

export function createWebhookDiagnosticLogger(
  log: (detail: Record<string, unknown>, message: string) => void,
): WebhookDiagnosticLogger {
  return ({ stage, detail = {} }) => {
    log(
      {
        webhookDiag: true,
        diagStage: stage,
        ...detail,
      },
      `[WA-WEBHOOK-DIAG] ${stage}`,
    );
  };
}

/** Redact secrets; keep shape for debugging. */
export function summarizeWebhookHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  return {
    contentType: headers["content-type"] ?? null,
    contentLength: headers["content-length"] ?? null,
    userAgent: headers["user-agent"] ?? null,
    hasSignatureHeader: Boolean(headers["x-hub-signature-256"]),
    signatureHeaderPrefix:
      typeof headers["x-hub-signature-256"] === "string"
        ? headers["x-hub-signature-256"].slice(0, 12)
        : null,
  };
}

export function previewRawBody(rawBody: string, maxLength = 400): string {
  if (rawBody.length <= maxLength) return rawBody;
  return `${rawBody.slice(0, maxLength)}…[+${rawBody.length - maxLength} bytes]`;
}
