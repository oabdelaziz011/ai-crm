import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, Redirect, useLocation } from "wouter";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import AuthCallback from "@/pages/auth-callback";
import ResetPassword from "@/pages/reset-password";
import DashboardApp from "@/pages/dashboard";
import WorkflowBuilderDebugPage from "@/pages/debug/workflow-builder-debug-page";
import AccessDeniedPage from "@/pages/access-denied";
import { AuthProvider, useAuth } from "@/context/auth-context";
import {
  hasPendingPasswordSetupIntent,
  isPublicAuthPath,
  RESET_PASSWORD_PATH,
} from "@/lib/auth-redirect";
import { usePermissions } from "@/hooks/use-rbac";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Keep UI stable in production and avoid leaking sensitive details.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card/40 p-6 text-center">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">Please refresh the page and try again.</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Redirects unauthenticated users to /login */
function ProtectedRoute({
  component: Component,
  requiredPermission,
  superAdminOnly,
}: {
  component: React.ComponentType;
  requiredPermission?: string;
  superAdminOnly?: boolean;
}) {
  const { user, isLoading } = useAuth();
  const { hasPermission, isLoading: permissionsLoading, isSuperAdmin } = usePermissions();

  if (isLoading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (superAdminOnly && !isSuperAdmin) {
    return <AccessDeniedPage requiredPermission="super_admin" />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <AccessDeniedPage requiredPermission={requiredPermission} />;
  }

  return <Component />;
}

/** Keeps invite/recovery users on the password setup route until they finish. */
function AuthFlowGuard({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !user || isPublicAuthPath(location)) {
      return;
    }

    if (hasPendingPasswordSetupIntent() && location !== RESET_PASSWORD_PATH) {
      setLocation(RESET_PASSWORD_PATH);
    }
  }, [user, isLoading, location, setLocation]);

  return children;
}

function Router() {
  return (
    <AuthFlowGuard>
      <Switch>
        <Route path="/" component={() => <Redirect to="/login" />} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/debug/workflow-builder" component={WorkflowBuilderDebugPage} />
        <Route path="/dashboard/permissions" component={() => <Redirect to="/dashboard/roles" />} />
        <Route
          path="/dashboard"
          nest
          component={() => <ProtectedRoute component={DashboardApp} />}
        />
        <Route component={NotFound} />
      </Switch>
    </AuthFlowGuard>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
              <Toaster />
            </WouterRouter>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
