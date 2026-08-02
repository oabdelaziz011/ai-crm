/** TEMP — remove after AI Employees trace */
export function aiEmployeesTrace(label: string, payload: Record<string, unknown>): void {
  console.log(`[AI_EMPLOYEES_TRACE ${label}]`, payload);
  if (typeof window !== "undefined") {
    const w = window as unknown as { __AI_EMPLOYEES_TRACE__?: Array<{ label: string; payload: Record<string, unknown>; at: string }> };
    w.__AI_EMPLOYEES_TRACE__ ??= [];
    w.__AI_EMPLOYEES_TRACE__.push({ label, payload, at: new Date().toISOString() });
  }
}
