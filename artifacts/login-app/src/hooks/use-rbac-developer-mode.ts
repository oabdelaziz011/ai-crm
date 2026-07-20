import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "vaultos.rbac.developerMode";

function readStoredDeveloperMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function useRbacDeveloperMode() {
  const [developerMode, setDeveloperModeState] = useState(readStoredDeveloperMode);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setDeveloperModeState(event.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDeveloperMode = useCallback((enabled: boolean) => {
    setDeveloperModeState(enabled);
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  return { developerMode, setDeveloperMode };
}
