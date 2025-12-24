import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LayoutShell } from "@/components/layout-shell";
import { Loader2 } from "lucide-react";

import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import Login from "@/pages/auth/login";
import Signup from "@/pages/auth/signup";

// Seeker Pages
import SeekerProfile from "@/pages/seeker/profile";
import SeekerJobs from "@/pages/seeker/jobs";
import SeekerApplications from "@/pages/seeker/applications";

// Employer Pages
import EmployerCompany from "@/pages/employer/company";
import EmployerPostJob from "@/pages/employer/job-post";
import EmployerJobDetails from "@/pages/employer/job-details";

function ProtectedRoute({ component: Component, role }: { component: React.ComponentType; role?: "seeker" | "employer" }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!user) return <Redirect to="/auth/login" />;
  if (role && user.role !== role) return <Redirect to="/" />;

  return <Component />;
}

function Router() {
  return (
    <LayoutShell>
      <Switch>
        <Route path="/" component={Home} />
        
        {/* Auth */}
        <Route path="/auth/login" component={Login} />
        <Route path="/auth/signup" component={Signup} />

        {/* Seeker Routes */}
        <Route path="/seeker/profile">
          <ProtectedRoute component={SeekerProfile} role="seeker" />
        </Route>
        <Route path="/seeker/jobs">
          <ProtectedRoute component={SeekerJobs} role="seeker" />
        </Route>
        <Route path="/seeker/applications">
          <ProtectedRoute component={SeekerApplications} role="seeker" />
        </Route>

        {/* Employer Routes */}
        <Route path="/employer/company">
          <ProtectedRoute component={EmployerCompany} role="employer" />
        </Route>
        <Route path="/employer/jobs/new">
          <ProtectedRoute component={EmployerPostJob} role="employer" />
        </Route>
        <Route path="/employer/jobs/:id">
          <ProtectedRoute component={EmployerJobDetails} role="employer" />
        </Route>

        <Route component={NotFound} />
      </Switch>
    </LayoutShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
