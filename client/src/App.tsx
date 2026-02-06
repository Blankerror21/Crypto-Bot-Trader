import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import MarketPage from "@/pages/market";
import BotConfigPage from "@/pages/bot-config";
import TransactionsPage from "@/pages/transactions";
import LandingPage from "@/pages/landing";
import AIAccuracyPage from "@/pages/ai-accuracy";
import AIVisionPage from "@/pages/ai-vision";
import BacktestingPage from "@/pages/backtesting";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return <Component />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/">
        {user ? <Dashboard /> : <LandingPage />}
      </Route>
      <Route path="/market">
        <ProtectedRoute component={MarketPage} />
      </Route>
      <Route path="/bot">
        <ProtectedRoute component={BotConfigPage} />
      </Route>
      <Route path="/transactions">
        <ProtectedRoute component={TransactionsPage} />
      </Route>
      <Route path="/ai-accuracy">
        <ProtectedRoute component={AIAccuracyPage} />
      </Route>
      <Route path="/ai-vision">
        <ProtectedRoute component={AIVisionPage} />
      </Route>
      <Route path="/backtesting">
        <ProtectedRoute component={BacktestingPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
