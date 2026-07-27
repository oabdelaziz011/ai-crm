import { useEffect, useState } from "react";

const TABLET_MIN = 768;
const TABLET_MAX = 1023;

export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsTablet(w >= TABLET_MIN && w <= TABLET_MAX);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isTablet;
}

export { useIsMobile } from "@/hooks/use-mobile";
