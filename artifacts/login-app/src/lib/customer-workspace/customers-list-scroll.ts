const SCROLL_KEY = "valueor.customers.list.scroll";

export function saveCustomersListScroll(): void {
  try {
    const main = document.querySelector("main");
    if (main) {
      sessionStorage.setItem(SCROLL_KEY, String(main.scrollTop));
    }
  } catch {
    /* ignore */
  }
}

export function restoreCustomersListScroll(): void {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return;
    requestAnimationFrame(() => {
      const main = document.querySelector("main");
      if (main) {
        main.scrollTop = Number(raw);
      }
    });
  } catch {
    /* ignore */
  }
}
