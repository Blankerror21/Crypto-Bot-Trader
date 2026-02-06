import { Button } from "@/components/ui/button";
import { Wallet, ShieldCheck, Zap } from "lucide-react";
import heroImg from "@assets/hero_chart.svg"; // Fallback if image not provided, user can replace

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar */}
      <nav className="border-b border-border/50 backdrop-blur-md fixed w-full z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold font-display text-xl tracking-tight">CryptoBot</span>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <a href="/api/login">Log in</a>
            </Button>
            <Button className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" asChild>
              <a href="/api/login">Get Started</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center pt-24 pb-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[128px] pointer-events-none" />

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left space-y-8 animate-enter">
            <h1 className="text-5xl sm:text-6xl font-extrabold font-display tracking-tight leading-tight">
              Automate Your <br />
              <span className="text-gradient">Crypto Trading</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Deploy algorithmic strategies in seconds. Test safely with our simulation engine before risking real capital.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-lg shadow-xl shadow-primary/25" asChild>
                <a href="/api/login">Start Trading Free</a>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 text-lg border-white/10 hover:bg-white/5">
                View Demo
              </Button>
            </div>
            
            <div className="pt-8 flex items-center gap-8 justify-center lg:justify-start text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span>Bank-grade Security</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                <span>Instant Execution</span>
              </div>
            </div>
          </div>

          <div className="relative animate-enter" style={{ animationDelay: "0.2s" }}>
            <div className="relative z-10 bg-card border border-white/10 rounded-2xl shadow-2xl p-2 md:p-4 rotate-2 hover:rotate-0 transition-transform duration-500">
               {/* Decorative UI Mockup */}
               <div className="rounded-xl bg-background/50 border border-white/5 overflow-hidden">
                 <div className="h-8 bg-white/5 border-b border-white/5 flex items-center px-4 gap-2">
                   <div className="w-3 h-3 rounded-full bg-red-500/50" />
                   <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                   <div className="w-3 h-3 rounded-full bg-green-500/50" />
                 </div>
                 <div className="p-8 space-y-6">
                   <div className="flex justify-between items-center">
                     <div className="space-y-2">
                       <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
                       <div className="h-8 w-48 bg-white/20 rounded animate-pulse" />
                     </div>
                     <div className="h-12 w-12 rounded-full bg-primary/20" />
                   </div>
                   <div className="space-y-3">
                     <div className="h-24 w-full bg-gradient-to-r from-primary/20 to-transparent rounded-lg" />
                     <div className="flex justify-between gap-4">
                       <div className="h-20 w-full bg-white/5 rounded-lg" />
                       <div className="h-20 w-full bg-white/5 rounded-lg" />
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
