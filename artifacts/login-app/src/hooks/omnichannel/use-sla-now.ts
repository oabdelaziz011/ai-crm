import { useEffect, useState } from "react";

/** Re-render SLA badges periodically so remaining/breach stay accurate without inventing data. */
export function useSlaNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
