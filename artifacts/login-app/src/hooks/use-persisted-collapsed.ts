import { useCallback, useState } from "react";

function readStoredCollapsed(storageKey: string, defaultValue = false): boolean {
  if (typeof window === "undefined") return defaultValue;
  return window.localStorage.getItem(storageKey) === "true";
}

export function usePersistedCollapsed(storageKey: string, defaultValue = false) {
  const [collapsed, setCollapsedState] = useState(() => readStoredCollapsed(storageKey, defaultValue));

  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapsedState(value);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(value));
      }
    },
    [storageKey],
  );

  const toggle = useCallback(() => {
    setCollapsedState((current) => {
      const next = !current;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(next));
      }
      return next;
    });
  }, [storageKey]);

  return { collapsed, setCollapsed, toggle };
}
