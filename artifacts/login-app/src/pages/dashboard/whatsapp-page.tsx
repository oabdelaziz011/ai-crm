import { useEffect } from "react";
import { useLocation } from "wouter";
import { getDashboardRouteById } from "@/config/dashboard-route-registry";

/** Legacy route — redirects to Team Inbox (Phase 8). */
export default function WhatsAppPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(getDashboardRouteById("team-inbox").nestedPath);
  }, [setLocation]);

  return null;
}
