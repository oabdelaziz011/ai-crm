import { useEffect } from "react";
import { useLocation } from "wouter";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";

/** Legacy route — redirects to Omnichannel Console (Phase 8). */
export default function WhatsAppPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(getDashboardRouteById("omnichannel").nestedPath);
  }, [setLocation]);

  return null;
}
