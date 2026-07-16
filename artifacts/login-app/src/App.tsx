import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, Redirect } from "wouter";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import AccessDeniedPage from "@/pages/access-denied";
import { AuthProvider, useAuth } from "@/context/auth-context";
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

/** Redirects unauthenticated users to /login */
function ProtectedRoute({
  component: Component,
  requiredPermission,
}: {
  component: React.ComponentType;
  requiredPermission?: string;
}) {
  const { user, isLoading } = useAuth();
  console.log("🔥🔥🔥 PROTECTED ROUTE IS RUNNING 🔥🔥🔥");
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  console.log("🔥 usePermissions hook created");
  const canAccess = hasPermission(requiredPermission ?? "customers.view");  
  console.log("🔥 canAccess =", canAccess); 

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

  if (requiredPermission && !canAccess) {
    return <AccessDeniedPage requiredPermission={requiredPermission} />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/login" />} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/dashboard/customers" component={() => <ProtectedRoute component={Dashboard} requiredPermission="customers.view" />} />
      <Route path="/dashboard/bookings" component={() => <ProtectedRoute component={Dashboard} requiredPermission="bookings.view" />} />
      <Route path="/dashboard/invoices" component={() => <ProtectedRoute component={Dashboard} requiredPermission="invoices.view" />} />
      <Route path="/dashboard/users" component={() => <ProtectedRoute component={Dashboard} requiredPermission="users.view" />} />
      <Route path="/dashboard/roles" component={() => <ProtectedRoute component={Dashboard} requiredPermission="roles.view" />} />
      <Route path="/dashboard/permissions" component={() => <ProtectedRoute component={Dashboard} requiredPermission="permissions.view" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
