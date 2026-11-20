/** TEMP — remove after AI Employees trace */
export function aiEmployeesTrace(label: string, payload: Record<string, unknown>): void {
  console.log(`[AI_EMPLOYEES_TRACE ${label}]`, payload);
  const browserGlobal = globalThis as typeof globalThis & {
    window?: {
      __AI_EMPLOYEES_TRACE__?: Array<{ label: string; payload: Record<string, unknown>; at: string }>;
    };
  };
  const w = browserGlobal.window;
  if (w) {
    w.__AI_EMPLOYEES_TRACE__ ??= [];
    w.__AI_EMPLOYEES_TRACE__.push({ label, payload, at: new Date().toISOString() });
  }
}
