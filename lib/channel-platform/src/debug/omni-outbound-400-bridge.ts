type OutboundValidationEnter = (input: {
  validationName: string;
  layer: string;
  file: string;
  function: string;
  line: number;
  requestPayload?: unknown;
}) => unknown;

type OutboundValidationPass = (validationName: string, extra?: Record<string, unknown>) => void;

type OutboundValidationFail = (input: {
  validationName: string;
  file: string;
  function: string;
  line: number;
  error: string;
  responseBody: unknown;
  rootCause: string;
  layer?: string;
}) => void;

declare global {
  // eslint-disable-next-line no-var
  var __traceOutboundValidationEnter__: OutboundValidationEnter | undefined;
  // eslint-disable-next-line no-var
  var __traceOutboundValidationPass__: OutboundValidationPass | undefined;
  // eslint-disable-next-line no-var
  var __traceOutboundValidationFail__: OutboundValidationFail | undefined;
}

export function traceOutboundValidationEnter(input: Parameters<OutboundValidationEnter>[0]): void {
  globalThis.__traceOutboundValidationEnter__?.(input);
}

export function traceOutboundValidationPass(validationName: string, extra?: Record<string, unknown>): void {
  globalThis.__traceOutboundValidationPass__?.(validationName, extra);
}

export function traceOutboundValidationFail(input: Parameters<OutboundValidationFail>[0]): void {
  globalThis.__traceOutboundValidationFail__?.(input);
}
