type OmniSendAsyncTracer = <T>(input: {
  runId?: string | null;
  layer: number;
  stage: string;
  file: string;
  function: string;
  line: number;
  conversationId?: string | null;
  messageId?: string | null;
  statusBefore?: string | null;
  extra?: Record<string, unknown>;
  run: () => Promise<T>;
  success: (result: T) => {
    messageId?: string | null;
    statusAfter?: string | null;
    extra?: Record<string, unknown>;
  };
}) => Promise<T>;

declare global {
  interface Window {
    __traceOmniSendAsync__?: OmniSendAsyncTracer;
  }
}

export function traceOmniSendBridgeAsync<T>(
  input: Parameters<NonNullable<OmniSendAsyncTracer>>[0],
  fallback: () => Promise<T>,
  mapSuccess: (result: T) => {
    messageId?: string | null;
    statusAfter?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<T> {
  const tracer = typeof globalThis !== "undefined"
    ? globalThis.window?.__traceOmniSendAsync__
    : undefined;
  if (!tracer) return fallback().then((result) => {
    mapSuccess(result);
    return result;
  });
  return tracer({ ...input, run: fallback, success: mapSuccess });
}
