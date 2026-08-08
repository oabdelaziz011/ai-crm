/**
 * Temporary WhatsApp AI prompt logs (execution engine side).
 * Remove once the inbound AI path is verified end-to-end.
 */

type LogData = Record<string, unknown>;

export function logWhatsApp(step: string, data?: LogData): void {
  if (data && Object.keys(data).length > 0) {
    console.log(`[WHATSAPP] ${step}`, data);
    return;
  }
  console.log(`[WHATSAPP] ${step}`);
}

export function logOpenAI(step: string, data?: LogData): void {
  if (data && Object.keys(data).length > 0) {
    console.log(`[OPENAI] ${step}`, data);
    return;
  }
  console.log(`[OPENAI] ${step}`);
}

export function logPipelineError(step: string, error: unknown, data?: LogData): void {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack ?? null }
      : { message: String(error) };
  console.error(`[ERROR] ${step}`, { ...(data ?? {}), ...detail });
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
