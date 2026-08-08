import { useCallback, useEffect, useState } from "react";

export type EmployeesTableDensity = "comfortable" | "compact";

type Prefs = {
  density: EmployeesTableDensity;
};

const STORAGE_KEY = "valueor-company-employees-prefs-v1";

function read(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { density: "comfortable" };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      density: parsed.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return { density: "comfortable" };
  }
}

export function useCompanyEmployeesPreferences() {
  const [prefs, setPrefs] = useState<Prefs>(() => read());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const setDensity = useCallback((density: EmployeesTableDensity) => {
    setPrefs((prev) => ({ ...prev, density }));
  }, []);

  return { density: prefs.density, setDensity };
}
