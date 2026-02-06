import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  LineChart, 
  Bot, 
  History, 
  LogOut, 
  Menu,
  Wallet,
  Target,
  Eye,
  FlaskConical
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const NAVIGATION = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Live Market", href: "/market", icon: LineChart },
  { name: "Bot Configuration", href: "/bot", icon: Bot },
  { name: "AI Vision", href: "/ai-vision", icon: Eye },
  { name: "AI Accuracy", href: "/ai-accuracy", icon: Target },
  { name: "Backtesting", href: "/backtesting", icon: FlaskConical },
  { name: "Transactions", href: "/transactions", icon: History },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <Wallet className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold font-display tracking-tight">CryptoBot</span>
        </div>

        <nav className="space-y-2">
          {NAVIGATION.map((item) => {
            const isActive = location === item.href;
            const testId = `nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`;
            return (
              <Link key={item.name} href={item.href}>
                <div
                  data-testid={testId}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer
                    ${isActive 
                      ? "bg-primary/10 text-primary shadow-sm border border-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-border">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={user?.profileImageUrl ?? undefined} />
            <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email}
            </p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 border-r border-border bg-card/50 backdrop-blur-xl fixed h-full z-10">
        <NavContent />
      </aside>

      {/* Mobile Header & Content */}
      <main className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        <header className="lg:hidden h-16 border-b border-border flex items-center px-4 justify-between bg-card/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold font-display">CryptoBot</span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-r border-border bg-card">
              <NavContent />
            </SheetContent>
          </Sheet>
        </header>

        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <div className="max-w-6xl mx-auto w-full animate-enter">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
