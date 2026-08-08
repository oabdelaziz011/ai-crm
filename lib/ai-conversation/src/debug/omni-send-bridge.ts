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
    __traceOmniSendEnter__?: (input: {
      runId?: string | null;
      layer: number;
      stage: string;
      file: string;
      function: string;
      line: number;
      conversationId?: string | null;
      messageId?: string | null;
      statusBefore?: string | null;
      statusAfter?: string | null;
      extra?: Record<string, unknown>;
    }) => void;
    __traceOmniSendExit__?: (input: {
      runId?: string | null;
      layer: number;
      stage: string;
      success: boolean;
      error?: string | null;
      conversationId?: string | null;
      messageId?: string | null;
      statusBefore?: string | null;
      statusAfter?: string | null;
      extra?: Record<string, unknown>;
    }) => void;
    __traceOmniSendSync__?: <T>(input: {
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
      run: () => T;
      success: (result: T) => {
        messageId?: string | null;
        statusAfter?: string | null;
        extra?: Record<string, unknown>;
      };
    }) => T;
  }
}

export function readBrowserWindow(): Window | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { window?: Window }).window;
}

export function traceOmniSendBridgeAsync<T>(
  meta: {
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
  },
  fallback: () => Promise<T>,
  mapSuccess: (result: T) => {
    messageId?: string | null;
    statusAfter?: string | null;
    extra?: Record<string, unknown>;
  },
): Promise<T> {
  const tracer = readBrowserWindow()?.__traceOmniSendAsync__;
  if (!tracer) return fallback().then((result) => {
    mapSuccess(result);
    return result;
  });
  return tracer({ ...meta, run: fallback, success: mapSuccess });
}
