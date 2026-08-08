/**
 * Temporary WhatsApp → AI reply pipeline logs for local diagnosis.
 * Remove once the inbound AI path is verified end-to-end.
 */

type LogData = Record<string, unknown>;

function serializeError(error: unknown): LogData {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }
  return { message: String(error) };
}

export function logWhatsApp(step: string, data?: LogData): void {
  if (data && Object.keys(data).length > 0) {
    console.log(`[WHATSAPP] ${step}`, data);
    return;
  }
  console.log(`[WHATSAPP] ${step}`);
}

export function logWhatsAppError(step: string, error: unknown, data?: LogData): void {
  console.error(`[ERROR] ${step}`, {
    ...(data ?? {}),
    ...serializeError(error),
  });
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
