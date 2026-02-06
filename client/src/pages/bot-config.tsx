import { useBotSettings, useUpdateBotSettings, useToggleBot, useAvailableCoins, useEnabledCoins, useEnableCoin, useDisableCoin } from "@/hooks/use-bot";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Save, Loader2, PlayCircle, PauseCircle, Coins, Plus, X, Check, CheckCheck, XCircle, AlertTriangle, Trash2, Shield, Sliders, Key, Brain, Zap, Server, Timer, Flame, TrendingUp, TrendingDown } from "lucide-react";
import { HelpTooltip } from "@/components/help-tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotSettingsSchema } from "@shared/schema";
import { z } from "zod";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

const formSchema = insertBotSettingsSchema.pick({
  strategy: true,
  riskLevel: true,
  tradeAmount: true,
  isSimulation: true,
  useAdaptiveTrading: true,
  baseTradePercent: true,
  minTradeAmount: true,
  maxTradeAmount: true,
  confluenceThreshold: true,
  orderBookBuyThreshold: true,
  orderBookSellThreshold: true,
  ensembleMinAgree: true,
  momentumThreshold: true,
});

type FormData = z.infer<typeof formSchema>;

export default function BotConfigPage() {
  const { data: settings, isLoading } = useBotSettings();
  const updateMutation = useUpdateBotSettings();
  const toggleMutation = useToggleBot();
  const queryClient = useQueryClient();
  
  const { data: availableCoins, isLoading: coinsLoading } = useAvailableCoins();
  const { data: enabledCoins } = useEnabledCoins();
  const enableCoinMutation = useEnableCoin();
  const disableCoinMutation = useDisableCoin();
  
  const [selectedCoin, setSelectedCoin] = useState<string>("");
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [secretKeyInput, setSecretKeyInput] = useState<string>('');
  const [keysInitialized, setKeysInitialized] = useState<boolean>(false);
  const [initializedForUser, setInitializedForUser] = useState<string | null>(null);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      strategy: "simple_momentum",
      riskLevel: "medium",
      tradeAmount: "100",
      isSimulation: true,
      useAdaptiveTrading: false,
      baseTradePercent: "5",
      minTradeAmount: "10",
      maxTradeAmount: "500",
      confluenceThreshold: 60,
      orderBookBuyThreshold: "0.6",
      orderBookSellThreshold: "1.6",
      ensembleMinAgree: 2,
      momentumThreshold: "8",
    },
  });
  
  const enabledSymbols = enabledCoins?.map(c => c.symbol) || [];
  const availableToAdd = availableCoins?.filter(c => !enabledSymbols.includes(c.symbol)) || [];
  
  const handleAddCoin = () => {
    if (selectedCoin) {
      enableCoinMutation.mutate({ symbol: selectedCoin, tradeAmount: form.watch("tradeAmount") || "100" });
      setSelectedCoin("");
    }
  };
  
  const handleRemoveCoin = (symbol: string) => {
    disableCoinMutation.mutate(symbol);
  };
  
  const [isBulkActionPending, setIsBulkActionPending] = useState(false);
  
  const clearPositionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/positions");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Positions Cleared",
        description: data.message || `Cleared ${data.clearedCount} position(s)`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear positions",
        variant: "destructive",
      });
    },
  });
  
  const handleSelectAll = useCallback(async () => {
    if (availableToAdd.length === 0) return;
    setIsBulkActionPending(true);
    const tradeAmount = form.watch("tradeAmount") || "100";
    let successCount = 0;
    let failCount = 0;
    try {
      for (const coin of availableToAdd) {
        await new Promise<void>((resolve) => {
          enableCoinMutation.mutate(
            { symbol: coin.symbol, tradeAmount },
            { 
              onSuccess: () => { successCount++; resolve(); },
              onError: () => { failCount++; resolve(); }
            }
          );
        });
      }
      if (failCount > 0) {
        toast({ title: "Bulk Enable Complete", description: `Enabled ${successCount} coins, ${failCount} failed`, variant: "destructive" });
      } else {
        toast({ title: "All Coins Enabled", description: `Successfully enabled ${successCount} coins` });
      }
    } finally {
      setIsBulkActionPending(false);
    }
  }, [availableToAdd, form, enableCoinMutation, toast]);
  
  const handleDeselectAll = useCallback(async () => {
    if (!enabledCoins || enabledCoins.length === 0) return;
    setIsBulkActionPending(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const coin of enabledCoins) {
        await new Promise<void>((resolve) => {
          disableCoinMutation.mutate(coin.symbol, { 
            onSuccess: () => { successCount++; resolve(); },
            onError: () => { failCount++; resolve(); }
          });
        });
      }
      if (failCount > 0) {
        toast({ title: "Bulk Disable Complete", description: `Disabled ${successCount} coins, ${failCount} failed`, variant: "destructive" });
      } else {
        toast({ title: "All Coins Disabled", description: `Successfully disabled ${successCount} coins` });
      }
    } finally {
      setIsBulkActionPending(false);
    }
  }, [enabledCoins, disableCoinMutation, toast]);

  // Load settings into form when data arrives
  useEffect(() => {
    if (settings) {
      form.reset({
        strategy: settings.strategy || "simple_momentum",
        riskLevel: settings.riskLevel || "medium",
        tradeAmount: settings.tradeAmount || "100",
        isSimulation: settings.isSimulation ?? true,
        useAdaptiveTrading: settings.useAdaptiveTrading ?? false,
        baseTradePercent: settings.baseTradePercent || "5",
        minTradeAmount: settings.minTradeAmount || "10",
        maxTradeAmount: settings.maxTradeAmount || "500",
        confluenceThreshold: settings.confluenceThreshold ?? 60,
        orderBookBuyThreshold: settings.orderBookBuyThreshold || "0.6",
        orderBookSellThreshold: settings.orderBookSellThreshold || "1.6",
        ensembleMinAgree: settings.ensembleMinAgree ?? 2,
        momentumThreshold: settings.momentumThreshold || "8",
      });
    }
  }, [settings, form]);

  // Sync API key inputs with server state
  useEffect(() => {
    if (settings) {
      if (settings.userId !== initializedForUser) {
        setApiKeyInput(settings.krakenApiKey || '');
        setSecretKeyInput(settings.krakenSecretKey || '');
        setKeysInitialized(true);
        setInitializedForUser(settings.userId);
      } else if (!keysInitialized) {
        setApiKeyInput(settings.krakenApiKey || '');
        setSecretKeyInput(settings.krakenSecretKey || '');
        setKeysInitialized(true);
        setInitializedForUser(settings.userId);
      }
    } else {
      setKeysInitialized(false);
      setInitializedForUser(null);
      setApiKeyInput('');
      setSecretKeyInput('');
    }
  }, [settings, keysInitialized, initializedForUser]);

  const keysMatchServer = keysInitialized && 
    (apiKeyInput || '') === (settings?.krakenApiKey || '') && 
    (secretKeyInput || '') === (settings?.krakenSecretKey || '');

  const onSubmit = (data: FormData) => {
    updateMutation.mutate(data);
  };

  const handleToggle = () => {
    if (settings) {
      toggleMutation.mutate(!settings.isActive);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 max-w-3xl mx-auto">
        <div className="text-center md:text-left">
          <h1 className="text-3xl font-bold font-display tracking-tight">Bot Configuration</h1>
          <p className="text-muted-foreground mt-1">
            All trading parameters and settings in one place.
          </p>
        </div>

        {/* Bot Status Header */}
        <Card className="glass-card p-6 md:p-8 border-white/5 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-border">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-300 ${settings?.isActive ? "bg-green-500/20 text-green-500 shadow-green-500/10" : "bg-red-500/20 text-red-500 shadow-red-500/10"}`}>
                <Bot className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Trading Engine</h2>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${settings?.isActive ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                  <span className="text-sm font-medium text-muted-foreground">
                    {settings?.isActive ? "Running" : "Stopped"}
                  </span>
                  {settings?.isSimulation === false && (
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                      Real Trading
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Button
              size="lg"
              variant={settings?.isActive ? "destructive" : "default"}
              onClick={handleToggle}
              disabled={toggleMutation.isPending}
              className={`min-w-[140px] font-semibold ${!settings?.isActive && "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white border-0"}`}
              data-testid="button-toggle-bot"
            >
              {toggleMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : settings?.isActive ? (
                <>
                  <PauseCircle className="w-5 h-5 mr-2" /> Stop Bot
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5 mr-2" /> Start Bot
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* SECTION 1: General Trading Settings */}
        <Card className="glass-card p-6 md:p-8 border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Sliders className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">General Trading</h2>
              <p className="text-sm text-muted-foreground">Core trading strategy and parameters</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Strategy and Risk */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="strategy">Trading Strategy</Label>
                  <HelpTooltip testId="strategy" content="Determines how the bot decides when to buy and sell. Simple Momentum follows trends, Mean Reversion buys dips, DCA invests regularly, Grid Trading uses price levels, Scalping makes quick small profits, and AI Trading uses artificial intelligence to analyze markets." />
                </div>
                <Select 
                  value={form.watch("strategy") || ""} 
                  onValueChange={(val) => form.setValue("strategy", val)}
                >
                  <SelectTrigger id="strategy" className="bg-background/50 h-12" data-testid="select-strategy">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple_momentum">Simple Momentum</SelectItem>
                    <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
                    <SelectItem value="dca">DCA (Dollar Cost Averaging)</SelectItem>
                    <SelectItem value="grid_trading">Grid Trading</SelectItem>
                    <SelectItem value="scalping">Scalping (0.1%)</SelectItem>
                    <SelectItem value="ai_trading">AI Trading (GPT-Powered)</SelectItem>
                    <SelectItem value="random_walk">Random Walk (Test)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.watch("strategy") === 'simple_momentum' && "Buys when price rises, sells when it drops."}
                  {form.watch("strategy") === 'mean_reversion' && "Buys below average price, sells above."}
                  {form.watch("strategy") === 'dca' && "Buys at regular intervals regardless of price."}
                  {form.watch("strategy") === 'grid_trading' && "Buys dips and sells peaks at preset levels."}
                  {form.watch("strategy") === 'scalping' && "Quick small-profit trades at 0.1% target."}
                  {form.watch("strategy") === 'ai_trading' && "Uses AI to analyze market conditions and make trades."}
                  {form.watch("strategy") === 'random_walk' && "Random buy/sell for testing purposes."}
                  {!form.watch("strategy") && "Select a trading strategy."}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="riskLevel">Risk Level</Label>
                  <HelpTooltip testId="risk-level" content="Controls how aggressively the bot trades. Low = smaller positions and tighter stop-losses. Medium = balanced approach. High = larger positions. MAX = most aggressive trading with maximum position sizes." />
                </div>
                <Select 
                  value={form.watch("riskLevel") || ""} 
                  onValueChange={(val) => form.setValue("riskLevel", val)}
                >
                  <SelectTrigger id="riskLevel" className="bg-background/50 h-12" data-testid="select-risk-level">
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (Conservative)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="high">High (Aggressive)</SelectItem>
                    <SelectItem value="aggressive">MAX (Ultra-Aggressive)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Higher risk uses larger position sizing.
                </p>
              </div>
            </div>

            {/* Trading Mode */}
            <div className="space-y-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="simulation-mode">Simulation Mode</Label>
                    <HelpTooltip testId="simulation-mode" content="When ON, trades only affect your virtual portfolio - no real money is used. Turn OFF to execute real trades on Kraken. Always test strategies in simulation first!" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled, trades only affect your virtual portfolio.
                  </p>
                </div>
                <Switch 
                  id="simulation-mode"
                  checked={!!form.watch("isSimulation")}
                  onCheckedChange={(checked) => form.setValue("isSimulation", checked)}
                  data-testid="switch-simulation-mode"
                />
              </div>
              {!form.watch("isSimulation") && (
                <div className="px-3 py-2 rounded bg-orange-500/10 border border-orange-500/20">
                  <p className="text-[10px] uppercase font-bold text-orange-500 tracking-wider">Warning: Real Trading Enabled</p>
                  <p className="text-xs text-muted-foreground">The bot will attempt to execute real orders on Kraken using your API keys.</p>
                </div>
              )}
            </div>

            {/* Trade Sizing */}
            <div className="space-y-4 p-4 rounded-lg bg-accent/30 border border-accent/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="adaptive-mode">Adaptive Trade Sizing</Label>
                    <HelpTooltip testId="adaptive-trading" content="When ON, the bot automatically adjusts trade amounts based on your portfolio size, market opportunity score, and risk settings. When OFF, uses a fixed dollar amount for every trade." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Adjust trade amounts based on portfolio size and market opportunity.
                  </p>
                </div>
                <Switch 
                  id="adaptive-mode"
                  checked={!!form.watch("useAdaptiveTrading")}
                  onCheckedChange={(checked) => form.setValue("useAdaptiveTrading", checked)}
                  data-testid="switch-adaptive-trading"
                />
              </div>
              
              {form.watch("useAdaptiveTrading") ? (
                <div className="space-y-4 pt-2">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="baseTradePercent">Base Trade %</Label>
                        <HelpTooltip testId="base-trade-percent" content="In adaptive mode, this is the base percentage of your USD balance used per trade. For example, 5% means a $10,000 portfolio would start with $500 trades, then adjusted by opportunity and risk multipliers." />
                      </div>
                      <div className="relative">
                        <Input 
                          id="baseTradePercent" 
                          className="pr-7 bg-background/50 font-mono"
                          placeholder="5"
                          {...form.register("baseTradePercent")}
                          data-testid="input-base-trade-percent"
                        />
                        <span className="absolute right-3 top-2 text-muted-foreground">%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        % of USD balance per trade
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="minTradeAmount">Min Trade</Label>
                        <HelpTooltip testId="min-trade" content="The smallest trade the bot will ever make, even if adaptive sizing calculates lower. Prevents tiny trades that waste fees." />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                        <Input 
                          id="minTradeAmount" 
                          className="pl-7 bg-background/50 font-mono"
                          placeholder="10"
                          {...form.register("minTradeAmount")}
                          data-testid="input-min-trade-amount"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Minimum trade size
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="maxTradeAmount">Max Trade</Label>
                        <HelpTooltip testId="max-trade" content="The largest trade the bot will ever make, even if adaptive sizing calculates higher. Protects against over-exposure to a single position." />
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                        <Input 
                          id="maxTradeAmount" 
                          className="pl-7 bg-background/50 font-mono"
                          placeholder="500"
                          {...form.register("maxTradeAmount")}
                          data-testid="input-max-trade-amount"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Maximum trade size
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground bg-background/50 p-2 rounded">
                    Trade size = Base % × Portfolio × Opportunity Score × Risk Multiplier, clamped to min/max
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="tradeAmount">Fixed Trade Amount (USD)</Label>
                    <HelpTooltip testId="trade-amount" content="When adaptive trading is OFF, this is the exact dollar amount used for every buy or sell order." />
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-muted-foreground">$</span>
                    <Input 
                      id="tradeAmount" 
                      className="pl-7 bg-background/50 font-mono"
                      placeholder="100.00"
                      {...form.register("tradeAmount")}
                      data-testid="input-trade-amount"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fixed amount to buy/sell per transaction signal.
                  </p>
                </div>
              )}
            </div>

            {/* Loop Interval */}
            <div className="space-y-3 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-cyan-500" />
                <Label className="font-semibold">Trading Loop Interval</Label>
                <HelpTooltip testId="loop-interval" content="How often the bot checks the market and makes decisions. Shorter intervals = more responsive but uses more API calls. Longer intervals = more cost-effective but slower reactions. 5 minutes is recommended for most users." />
              </div>
              <Select
                value={String(settings?.loopInterval || 10)}
                onValueChange={(val) => updateMutation.mutate({ loopInterval: parseInt(val) })}
                disabled={updateMutation.isPending}
              >
                <SelectTrigger className="bg-background/50" data-testid="select-loop-interval">
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 seconds (fastest)</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                  <SelectItem value="300">5 minutes (recommended)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often the bot analyzes the market and makes trading decisions. Longer intervals save API costs.
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <Button 
                type="submit" 
                size="lg"
                disabled={updateMutation.isPending}
                className="bg-primary hover:bg-primary/90 min-w-[120px]"
                data-testid="button-save-general"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>

        {/* SECTION 2: AI Settings */}
        <Card className="glass-card p-6 md:p-8 border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Brain className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">AI Settings</h2>
              <p className="text-sm text-muted-foreground">Configure AI-powered trading features</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* AI Auto-Pilot */}
            <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-purple-400" />
                  <div>
                    <div className="flex items-center gap-1">
                      <Label htmlFor="auto-pilot" className="text-base font-semibold text-purple-300">AI Auto-Pilot</Label>
                      <HelpTooltip testId="auto-pilot" content="Full autonomous AI mode. The AI analyzes market conditions and makes all trading decisions including when to buy, sell, and how much. Works with any strategy but is most powerful with AI Trading strategy." />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      AI makes all decisions: strategy, trade size, risk settings, timing
                    </p>
                  </div>
                </div>
                <Switch
                  id="auto-pilot"
                  data-testid="switch-auto-pilot"
                  checked={settings?.enableAutoPilot ?? false}
                  onCheckedChange={(checked) => updateMutation.mutate({ enableAutoPilot: checked })}
                  disabled={updateMutation.isPending}
                />
              </div>
              
              {settings?.enableAutoPilot && (
                <div className="p-2 rounded bg-purple-500/20 text-xs text-purple-200">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <span className="font-medium">AI Auto-Pilot Active</span>
                  </div>
                  <p className="mt-1 text-purple-300/80">
                    {settings?.customAiEndpoint 
                      ? `Using custom AI: ${settings.customAiEndpoint}`
                      : 'Using OpenAI API for decisions'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* AI Self-Awareness */}
            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-accent/30 border border-accent/20">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 text-purple-400" />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="self-awareness" className="font-medium">AI Self-Awareness</Label>
                    <HelpTooltip testId="self-awareness" content="Gives the AI feedback about its past prediction accuracy. This helps it learn from mistakes and adjust its confidence levels over time for better decisions." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    AI receives feedback about its prediction accuracy to improve over time
                  </p>
                </div>
              </div>
              <Switch
                id="self-awareness"
                data-testid="switch-self-awareness"
                checked={settings?.enableSelfAwareness !== false}
                onCheckedChange={(checked) => updateMutation.mutate({ enableSelfAwareness: checked })}
                disabled={updateMutation.isPending}
              />
            </div>

            {/* Structured Output Mode */}
            <div className="flex items-center justify-between gap-3 p-4 rounded-lg bg-accent/30 border border-accent/20">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="structured-output" className="font-medium">Structured Output</Label>
                    <HelpTooltip testId="structured-output" content="Forces the AI to respond in a specific JSON format. Provides more consistent and parseable responses but may reduce creative analysis. Recommended for stability." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use structured JSON output for faster, more reliable AI responses
                  </p>
                </div>
              </div>
              <Switch
                id="structured-output"
                data-testid="switch-structured-output"
                checked={Boolean((settings as any)?.useStructuredOutput)}
                onCheckedChange={(checked) => updateMutation.mutate({ useStructuredOutput: checked })}
                disabled={updateMutation.isPending}
              />
            </div>

            {/* Custom AI Server */}
            <div className="space-y-3 p-4 rounded-lg bg-accent/30 border border-accent/20">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-purple-400" />
                <Label className="font-semibold">Custom AI Server (Optional)</Label>
                <HelpTooltip testId="custom-ai-server" content="Use your own AI model instead of OpenAI. Enter the full URL endpoint. The server must accept the same API format as OpenAI's chat completion endpoint." />
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="custom-ai-endpoint" className="text-xs text-muted-foreground">API Endpoint</Label>
                    <HelpTooltip testId="custom-ai-endpoint" content="The full URL to your AI server's chat completion endpoint. Must be compatible with OpenAI's API format. Example: https://your-server.com/v1" />
                  </div>
                  <Input 
                    id="custom-ai-endpoint"
                    type="text"
                    data-testid="input-custom-ai-endpoint"
                    placeholder="http://192.168.1.100:1234/v1"
                    className="bg-background/50 font-mono"
                    value={settings?.customAiEndpoint || ""}
                    onChange={(e) => updateMutation.mutate({ customAiEndpoint: e.target.value || null })}
                    disabled={updateMutation.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="custom-ai-model" className="text-xs text-muted-foreground">Model Name</Label>
                    <HelpTooltip testId="custom-ai-model" content="The name of the AI model to use on your custom server. Check your server's documentation for available models. Example: gpt-4, llama-70b, qwen-30b" />
                  </div>
                  <Input 
                    id="custom-ai-model"
                    type="text"
                    data-testid="input-custom-ai-model"
                    placeholder="Model name (e.g., gpt-oss-20b)"
                    className="bg-background/50 font-mono"
                    value={settings?.customAiModel || ""}
                    onChange={(e) => updateMutation.mutate({ customAiModel: e.target.value || null })}
                    disabled={updateMutation.isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use LM Studio or any OpenAI-compatible server. Leave blank to use OpenAI.
                </p>
              </div>
            </div>

            {/* Hot Coin Detection */}
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <div>
                    <div className="flex items-center gap-1">
                      <Label htmlFor="focus-hot-coins" className="text-base font-semibold text-orange-300">Focus on Hot Coins</Label>
                      <HelpTooltip testId="hot-coin-detection" content="Scans all available cryptocurrencies to find the most volatile and trending coins. Automatically focuses trading on the hottest opportunities. Only trades the top 3 most active coins." />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only trade the top 3 most volatile coins each cycle
                    </p>
                  </div>
                </div>
                <Switch
                  id="focus-hot-coins"
                  data-testid="switch-focus-hot-coins"
                  checked={settings?.focusOnHotCoins ?? false}
                  onCheckedChange={(checked) => updateMutation.mutate({ focusOnHotCoins: checked })}
                  disabled={updateMutation.isPending}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* SECTION 3: Risk Management */}
        <Card className="glass-card p-6 md:p-8 border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Risk Management</h2>
              <p className="text-sm text-muted-foreground">Stop loss, take profit, and position limits</p>
            </div>
            {settings?.enableAutoPilot && (
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs ml-auto">
                AI Controlled
              </Badge>
            )}
          </div>

          {settings?.enableAutoPilot && (
            <div className="text-xs text-purple-400/80 bg-purple-500/5 border border-purple-500/20 rounded p-3 mb-6">
              Auto-Pilot is dynamically adjusting risk settings based on market conditions.
            </div>
          )}

          <div className="space-y-4">
            {/* Stop Loss */}
            <div className={`flex items-center justify-between gap-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 ${settings?.enableAutoPilot ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3 flex-1">
                <Switch
                  id="stop-loss"
                  data-testid="switch-stop-loss"
                  checked={settings?.enableAutoPilot ? true : Boolean(settings?.enableStopLoss)}
                  onCheckedChange={(checked) => updateMutation.mutate({ enableStopLoss: checked })}
                  disabled={updateMutation.isPending || Boolean(settings?.enableAutoPilot)}
                />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="stop-loss" className="font-medium flex items-center gap-2">
                      <TrendingDown className="w-4 h-4 text-red-400" />
                      Stop Loss
                    </Label>
                    <HelpTooltip testId="stop-loss" content="Automatically sells a position if it drops by this percentage from your entry price. Protects against large losses. Example: 5% stop-loss sells if you bought at $100 and price drops to $95." />
                  </div>
                  <p className="text-xs text-muted-foreground">Automatically sell if price drops below threshold</p>
                </div>
              </div>
              <div className="relative w-24">
                <Input 
                  type="number"
                  className="pr-6 text-right bg-background/50 font-mono"
                  value={settings?.stopLossPercent || "5"}
                  onChange={(e) => updateMutation.mutate({ stopLossPercent: e.target.value })}
                  disabled={updateMutation.isPending || !settings?.enableStopLoss || Boolean(settings?.enableAutoPilot)}
                  data-testid="input-stop-loss-percent"
                />
                <span className="absolute right-3 top-2 text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Take Profit */}
            <div className={`flex items-center justify-between gap-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20 ${settings?.enableAutoPilot ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3 flex-1">
                <Switch
                  id="take-profit"
                  data-testid="switch-take-profit"
                  checked={settings?.enableAutoPilot ? true : Boolean(settings?.enableTakeProfit)}
                  onCheckedChange={(checked) => updateMutation.mutate({ enableTakeProfit: checked })}
                  disabled={updateMutation.isPending || Boolean(settings?.enableAutoPilot)}
                />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="take-profit" className="font-medium flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      Take Profit
                    </Label>
                    <HelpTooltip testId="take-profit" content="Automatically sells a position when it gains this percentage. Locks in profits. Example: 10% take-profit sells if you bought at $100 and price rises to $110." />
                  </div>
                  <p className="text-xs text-muted-foreground">Automatically sell if price rises above threshold</p>
                </div>
              </div>
              <div className="relative w-24">
                <Input 
                  type="number"
                  className="pr-6 text-right bg-background/50 font-mono"
                  value={settings?.takeProfitPercent || "10"}
                  onChange={(e) => updateMutation.mutate({ takeProfitPercent: e.target.value })}
                  disabled={updateMutation.isPending || !settings?.enableTakeProfit || Boolean(settings?.enableAutoPilot)}
                  data-testid="input-take-profit-percent"
                />
                <span className="absolute right-3 top-2 text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Quick Profit */}
            <div className={`flex items-center justify-between gap-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 ${settings?.enableAutoPilot ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3 flex-1">
                <Switch
                  id="quick-profit"
                  data-testid="switch-quick-profit"
                  checked={Boolean(settings?.enableQuickProfit)}
                  onCheckedChange={(checked) => updateMutation.mutate({ enableQuickProfit: checked })}
                  disabled={updateMutation.isPending || Boolean(settings?.enableAutoPilot)}
                />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="quick-profit" className="font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      Quick Profit
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">Day-Trade</Badge>
                    </Label>
                    <HelpTooltip testId="quick-profit" content="Quickly locks in small gains for day trading. When a position reaches this percentage profit, it sells immediately to capture gains. Great for volatile markets." />
                  </div>
                  <p className="text-xs text-muted-foreground">Lock in small gains quickly for day trading</p>
                </div>
              </div>
              <div className="relative w-24">
                <Input 
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  className="pr-6 text-right bg-background/50 font-mono"
                  value={settings?.quickProfitPercent || "0.5"}
                  onChange={(e) => updateMutation.mutate({ quickProfitPercent: e.target.value })}
                  disabled={updateMutation.isPending || !settings?.enableQuickProfit || Boolean(settings?.enableAutoPilot)}
                  data-testid="input-quick-profit-percent"
                />
                <span className="absolute right-3 top-2 text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Trailing Stop */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center gap-3 flex-1">
                <Switch
                  id="trailing-stop"
                  data-testid="switch-trailing-stop"
                  checked={Boolean(settings?.enableTrailingStop)}
                  onCheckedChange={(checked) => updateMutation.mutate({ enableTrailingStop: checked })}
                  disabled={updateMutation.isPending}
                />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="trailing-stop" className="font-medium flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      Trailing Stop
                      <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">Lock Profits</Badge>
                    </Label>
                    <HelpTooltip testId="trailing-stop" content="When enabled, the stop-loss price moves up as the price increases, locking in gains. If price drops by the trailing % from the highest point, it triggers a sell. Great for riding trends." />
                  </div>
                  <p className="text-xs text-muted-foreground">Stop loss that follows price upward to lock in gains</p>
                </div>
              </div>
              <div className="relative w-24">
                <Input 
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  className="pr-6 text-right bg-background/50 font-mono"
                  value={settings?.trailingStopPercent || "2"}
                  onChange={(e) => updateMutation.mutate({ trailingStopPercent: e.target.value })}
                  disabled={updateMutation.isPending || !settings?.enableTrailingStop}
                  data-testid="input-trailing-stop-percent"
                />
                <span className="absolute right-3 top-2 text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* Max Drawdown */}
            <div className={`flex items-center justify-between gap-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 ${settings?.enableAutoPilot ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3 flex-1">
                <Switch
                  id="max-drawdown"
                  data-testid="switch-max-drawdown"
                  checked={settings?.enableAutoPilot ? true : Boolean(settings?.enableMaxDrawdown)}
                  onCheckedChange={(checked) => updateMutation.mutate({ enableMaxDrawdown: checked })}
                  disabled={updateMutation.isPending || Boolean(settings?.enableAutoPilot)}
                />
                <div>
                  <div className="flex items-center gap-1">
                    <Label htmlFor="max-drawdown" className="font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      Max Drawdown
                    </Label>
                    <HelpTooltip testId="max-drawdown" content="Maximum number of different coins the bot can hold at once. Limits exposure and ensures diversification. Also stops trading if portfolio drops below this percentage threshold from its peak." />
                  </div>
                  <p className="text-xs text-muted-foreground">Stop trading if portfolio drops below this threshold</p>
                </div>
              </div>
              <div className="relative w-24">
                <Input 
                  type="number"
                  className="pr-6 text-right bg-background/50 font-mono"
                  value={settings?.maxDrawdownPercent || "20"}
                  onChange={(e) => updateMutation.mutate({ maxDrawdownPercent: e.target.value })}
                  disabled={updateMutation.isPending || !settings?.enableMaxDrawdown || Boolean(settings?.enableAutoPilot)}
                  data-testid="input-max-drawdown-percent"
                />
                <span className="absolute right-3 top-2 text-muted-foreground text-sm">%</span>
              </div>
            </div>

            {/* SCALPING MODE - Advanced Day Trading */}
            <div className={`space-y-4 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    id="scalping-mode"
                    data-testid="switch-scalping-mode"
                    checked={Boolean(settings?.enableScalpingMode)}
                    onCheckedChange={(checked) => updateMutation.mutate({ enableScalpingMode: checked })}
                    disabled={updateMutation.isPending}
                  />
                  <div>
                    <Label htmlFor="scalping-mode" className="font-medium flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-400" />
                      Scalping Mode
                      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">PRO</Badge>
                      <HelpTooltip testId="scalping-mode" content="Ultra-aggressive day trading mode using short timeframes (1m/5m/15m/30m). Uses EMA crossovers, RSI, Bollinger Bands, and VWAP for quick entries. Auto-adjusts gates: 10% confluence threshold, relaxed order book filters, and only needs 1/3 AI ensemble agreement. Best for volatile markets with clear momentum." />
                    </Label>
                    <p className="text-xs text-muted-foreground">Ultra-fast trades using 1m/5m/15m/30m only</p>
                  </div>
                </div>
              </div>
              
              {settings?.enableScalpingMode && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-purple-500/20">
                  <div className="space-y-1">
                    <Label className="text-xs">Target %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="2"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingTargetPercent || "0.5"}
                      onChange={(e) => updateMutation.mutate({ scalpingTargetPercent: e.target.value })}
                      data-testid="input-scalping-target"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Stop Loss %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="1"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingStopPercent || "0.3"}
                      onChange={(e) => updateMutation.mutate({ scalpingStopPercent: e.target.value })}
                      data-testid="input-scalping-stop"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Trailing %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="1"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingTrailingPercent || "0.2"}
                      onChange={(e) => updateMutation.mutate({ scalpingTrailingPercent: e.target.value })}
                      data-testid="input-scalping-trailing"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Timeout (min)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingTimeoutMinutes || "15"}
                      onChange={(e) => updateMutation.mutate({ scalpingTimeoutMinutes: parseInt(e.target.value) })}
                      data-testid="input-scalping-timeout"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Spread %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.5"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingMinSpread || "0.1"}
                      onChange={(e) => updateMutation.mutate({ scalpingMinSpread: e.target.value })}
                      data-testid="input-scalping-spread"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Volume Spike</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingVolumeMultiplier || "1.5"}
                      onChange={(e) => updateMutation.mutate({ scalpingVolumeMultiplier: e.target.value })}
                      data-testid="input-scalping-volume"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">EMA Fast</Label>
                    <Input
                      type="number"
                      min="3"
                      max="20"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingEmaFast || "9"}
                      onChange={(e) => updateMutation.mutate({ scalpingEmaFast: parseInt(e.target.value) })}
                      data-testid="input-scalping-ema-fast"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">EMA Slow</Label>
                    <Input
                      type="number"
                      min="10"
                      max="50"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingEmaSlow || "21"}
                      onChange={(e) => updateMutation.mutate({ scalpingEmaSlow: parseInt(e.target.value) })}
                      data-testid="input-scalping-ema-slow"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">RSI Oversold</Label>
                    <Input
                      type="number"
                      min="10"
                      max="40"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingRsiOversold || "30"}
                      onChange={(e) => updateMutation.mutate({ scalpingRsiOversold: parseInt(e.target.value) })}
                      data-testid="input-scalping-rsi-oversold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      Anti-Chop ATR %
                      <HelpTooltip testId="scalping-anti-chop" content="Minimum ATR (Average True Range) volatility required for trades. Markets with ATR below this threshold are considered 'too choppy' and blocked. Lower = more trades allowed. Current market ATRs are typically 0.1-0.3%." />
                    </Label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.05"
                      max="1"
                      className="bg-background/50 font-mono text-sm"
                      value={settings?.scalpingAntiChopAtr || "0.15"}
                      onChange={(e) => updateMutation.mutate({ scalpingAntiChopAtr: e.target.value })}
                      data-testid="input-scalping-anti-chop-atr"
                    />
                  </div>
                </div>
              )}
              
              {settings?.enableScalpingMode && (
                <div className="text-xs text-muted-foreground bg-purple-500/5 p-2 rounded">
                  <strong>Scalping gates auto-adjusted:</strong> Confluence 5% | OrderBook Buy 0.15x | Ensemble OFF
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* SECTION 4: Exchange Settings */}
        <Card className="glass-card p-6 md:p-8 border-white/5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Key className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Exchange Settings</h2>
              <p className="text-sm text-muted-foreground">Kraken API configuration for real trading</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="kraken-api-key">Kraken API Key</Label>
                <HelpTooltip testId="kraken-api-key" content="Your Kraken exchange API key. Required for real trading. Get this from your Kraken account settings. For simulation mode, you can leave this blank." />
              </div>
              <Input 
                type="password"
                id="kraken-api-key"
                data-testid="input-kraken-api-key"
                placeholder="Enter your Kraken API key"
                className="bg-background/50 font-mono"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="kraken-secret-key">Kraken Secret Key</Label>
                <HelpTooltip testId="kraken-secret" content="Your Kraken secret key that pairs with the API key. Keep this private! Required for real trading. Get this from your Kraken account settings." />
              </div>
              <Input 
                type="password"
                id="kraken-secret-key"
                data-testid="input-kraken-secret-key"
                placeholder="Enter your Kraken secret key"
                className="bg-background/50 font-mono"
                value={secretKeyInput}
                onChange={(e) => setSecretKeyInput(e.target.value)}
                disabled={updateMutation.isPending}
              />
            </div>
            
            <Button
              data-testid="button-save-api-keys"
              className="w-full"
              disabled={updateMutation.isPending || keysMatchServer}
              onClick={() => {
                updateMutation.mutate(
                  { 
                    krakenApiKey: apiKeyInput || null, 
                    krakenSecretKey: secretKeyInput || null 
                  },
                  {
                    onSuccess: () => {
                      toast({
                        title: "API Keys Saved",
                        description: "Your Kraken API keys have been saved successfully.",
                      });
                    },
                    onError: (error: any) => {
                      toast({
                        title: "Error Saving Keys",
                        description: error?.message || "Failed to save API keys. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }
                );
              }}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : keysMatchServer ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Keys Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save API Keys
                </>
              )}
            </Button>
            
            <p className="text-xs text-muted-foreground">
              Add your own Kraken API keys to trade with your account. Required for real trading mode.
            </p>
            
            {(settings?.krakenApiKey || settings?.krakenSecretKey) && (
              <div className="flex items-center gap-2 p-3 rounded bg-amber-500/10 border border-amber-500/20">
                <Key className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-amber-400">Using your personal Kraken account</span>
              </div>
            )}
          </div>
        </Card>

        {/* SECTION 5: Coin Selection */}
        <Card className="glass-card p-6 md:p-8 border-white/5">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Coins className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Coin Selection</h2>
                <p className="text-sm text-muted-foreground">Choose which cryptocurrencies to trade</p>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={availableToAdd.length === 0 || isBulkActionPending || enableCoinMutation.isPending}
                data-testid="button-select-all-coins"
              >
                {isBulkActionPending && enableCoinMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4 mr-1" />
                )}
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={!enabledCoins || enabledCoins.length === 0 || isBulkActionPending || disableCoinMutation.isPending}
                data-testid="button-deselect-all-coins"
              >
                {isBulkActionPending && disableCoinMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4 mr-1" />
                )}
                Deselect All
              </Button>
              <HelpTooltip testId="bulk-coin-actions" content="Quickly enable or disable all available cryptocurrencies for trading. Useful when you want to start fresh or trade everything." />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {enabledCoins && enabledCoins.length > 0 ? (
                enabledCoins.map((coin) => {
                  const coinInfo = availableCoins?.find(c => c.symbol === coin.symbol);
                  return (
                    <Badge 
                      key={coin.symbol} 
                      variant="secondary" 
                      className="py-2 px-3 text-sm gap-2"
                    >
                      <Check className="w-3 h-3 text-green-500" />
                      {coinInfo?.name || coin.symbol} ({coin.symbol})
                      <button
                        onClick={() => handleRemoveCoin(coin.symbol)}
                        className="ml-1 hover:text-destructive transition-colors"
                        disabled={disableCoinMutation.isPending}
                        data-testid={`button-remove-coin-${coin.symbol}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No coins enabled yet. Add coins below to start trading.</p>
              )}
            </div>
            
            <div className="flex gap-2 pt-4 border-t border-border items-center">
              <div className="flex items-center gap-1">
                <Label className="sr-only">Add Coin</Label>
                <HelpTooltip testId="add-coin" content="Select a cryptocurrency to add to your trading portfolio. Only enabled coins will be analyzed and traded by the bot." />
              </div>
              <Select value={selectedCoin} onValueChange={setSelectedCoin}>
                <SelectTrigger className="flex-1 bg-background/50" data-testid="select-add-coin">
                  <SelectValue placeholder="Select a coin to add..." />
                </SelectTrigger>
                <SelectContent>
                  {coinsLoading ? (
                    <SelectItem value="loading" disabled>Loading coins...</SelectItem>
                  ) : availableToAdd.length === 0 ? (
                    <SelectItem value="none" disabled>All coins already added</SelectItem>
                  ) : (
                    availableToAdd.map((coin) => (
                      <SelectItem key={coin.symbol} value={coin.symbol}>
                        {coin.name} ({coin.symbol})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAddCoin}
                disabled={!selectedCoin || enableCoinMutation.isPending}
                data-testid="button-add-coin"
              >
                {enableCoinMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </>
                )}
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground">
              The bot will monitor and trade all enabled coins using the same strategy. Each coin uses the default trade amount setting above.
            </p>
          </div>
        </Card>
        
        {/* SECTION 6: Gate Thresholds */}
        <Card className="glass-card p-6 md:p-8 border-white/5" data-testid="card-gate-thresholds">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Gate Thresholds</h2>
              <p className="text-sm text-muted-foreground">Control how strict the safety gates are for trade execution</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-4 p-4 rounded-lg bg-accent/30 border border-accent/20">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="confluenceThreshold">Confluence Gate Threshold</Label>
                    <HelpTooltip testId="confluence-threshold" content="Minimum percentage of timeframe indicators that must agree before executing a trade. Higher values = more confirmation needed = fewer but higher-quality trades. 60% is recommended." />
                  </div>
                  <Badge variant="outline" className="font-mono">{form.watch("confluenceThreshold") ?? 60}%</Badge>
                </div>
                <Input 
                  id="confluenceThreshold" 
                  type="range"
                  min="20"
                  max="90"
                  step="5"
                  className="w-full cursor-pointer"
                  value={form.watch("confluenceThreshold") ?? 60}
                  onChange={(e) => form.setValue("confluenceThreshold", parseInt(e.target.value), { shouldDirty: true })}
                  data-testid="slider-confluence-threshold"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum % of timeframes that must agree before allowing a trade. Lower = more trades, higher = more selective.
                </p>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="orderBookBuyThreshold">Order Book Buy Gate</Label>
                      <HelpTooltip testId="order-book-buy" content="Minimum buy/sell pressure ratio in the order book before buying. Values below 1.0 mean more selling pressure. Lower values = stricter filter. 0.6 means allow buys when sellers outnumber buyers 1.6:1." />
                    </div>
                    <Badge variant="outline" className="font-mono">{form.watch("orderBookBuyThreshold") || "0.6"}x</Badge>
                  </div>
                  <Input 
                    id="orderBookBuyThreshold" 
                    type="range"
                    min="0.3"
                    max="1.0"
                    step="0.1"
                    className="w-full cursor-pointer"
                    value={form.watch("orderBookBuyThreshold") || "0.6"}
                    onChange={(e) => form.setValue("orderBookBuyThreshold", e.target.value, { shouldDirty: true })}
                    data-testid="slider-orderbook-buy-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Block buys when sell pressure is above this ratio. Lower = stricter.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Label htmlFor="orderBookSellThreshold">Order Book Sell Gate</Label>
                      <HelpTooltip testId="order-book-sell" content="Maximum buy/sell pressure ratio before selling. Values above 1.0 mean more buying pressure. Higher values = stricter filter. 1.6 means allow sells when buyers outnumber sellers 1.6:1." />
                    </div>
                    <Badge variant="outline" className="font-mono">{form.watch("orderBookSellThreshold") || "1.6"}x</Badge>
                  </div>
                  <Input 
                    id="orderBookSellThreshold" 
                    type="range"
                    min="1.0"
                    max="2.5"
                    step="0.1"
                    className="w-full cursor-pointer"
                    value={form.watch("orderBookSellThreshold") || "1.6"}
                    onChange={(e) => form.setValue("orderBookSellThreshold", e.target.value, { shouldDirty: true })}
                    data-testid="slider-orderbook-sell-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Block sells when buy pressure is above this ratio. Higher = stricter.
                  </p>
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="ensembleMinAgree">Ensemble Gate (AI Agreement)</Label>
                    <HelpTooltip testId="ensemble-agree" content="Minimum number of AI perspectives (momentum, mean reversion, risk manager) that must agree on a trade. 2/3 means at least 2 out of 3 must vote the same way." />
                  </div>
                  <Badge variant="outline" className="font-mono">{form.watch("ensembleMinAgree") ?? 2} of 3</Badge>
                </div>
                <Select 
                  value={String(form.watch("ensembleMinAgree") ?? 2)} 
                  onValueChange={(val) => form.setValue("ensembleMinAgree", parseInt(val), { shouldDirty: true })}
                >
                  <SelectTrigger id="ensembleMinAgree" className="bg-background/50" data-testid="select-ensemble-min-agree">
                    <SelectValue placeholder="Select agreement level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 of 3 (Most Aggressive - Any AI can trigger)</SelectItem>
                    <SelectItem value="2">2 of 3 (Balanced - Majority must agree)</SelectItem>
                    <SelectItem value="3">3 of 3 (Most Conservative - All must agree)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How many AI perspectives (momentum, mean-reversion, risk-manager) must agree for trade execution.
                </p>
              </div>
              
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="momentumThreshold">Momentum Injection Threshold</Label>
                    <HelpTooltip testId="momentum-threshold" content="Minimum 24-hour price change percentage to consider a coin 'hot'. Higher values filter for only the most volatile coins. 8% means the coin must have moved 8% or more in 24 hours." />
                  </div>
                  <Badge variant="outline" className="font-mono">{form.watch("momentumThreshold") || "8"}%</Badge>
                </div>
                <Slider
                  id="momentumThreshold"
                  min={1}
                  max={15}
                  step={1}
                  value={[parseFloat(form.watch("momentumThreshold") || "8")]}
                  onValueChange={([value]) => form.setValue("momentumThreshold", String(value), { shouldDirty: true })}
                  className="w-full"
                  data-testid="slider-momentum-threshold"
                />
                <p className="text-xs text-muted-foreground">
                  24h price change (%) required to trigger momentum injection. Lower = more aggressive (catches smaller moves), Higher = more conservative (only massive pumps).
                </p>
              </div>
            </div>
            
            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-muted-foreground">
                <strong className="text-amber-500">Note:</strong> Lower thresholds allow more trades but increase risk. 
                The current market is ranging with mixed signals, so many trades are being blocked by these gates. 
                Adjust carefully based on your risk tolerance.
              </p>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button 
                type="button"
                onClick={() => {
                  form.setValue("confluenceThreshold", 60, { shouldDirty: true });
                  form.setValue("orderBookBuyThreshold", "0.6", { shouldDirty: true });
                  form.setValue("orderBookSellThreshold", "1.6", { shouldDirty: true });
                  form.setValue("ensembleMinAgree", 2, { shouldDirty: true });
                  form.setValue("momentumThreshold", "8", { shouldDirty: true });
                }}
                variant="outline"
                size="sm"
                data-testid="button-reset-gates"
              >
                <Sliders className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
              <Button 
                type="button"
                onClick={() => {
                  updateMutation.mutate({
                    confluenceThreshold: form.getValues("confluenceThreshold"),
                    orderBookBuyThreshold: form.getValues("orderBookBuyThreshold"),
                    orderBookSellThreshold: form.getValues("orderBookSellThreshold"),
                    ensembleMinAgree: form.getValues("ensembleMinAgree"),
                    momentumThreshold: form.getValues("momentumThreshold"),
                  });
                }}
                disabled={updateMutation.isPending}
                size="sm"
                data-testid="button-save-gates"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Gate Settings
              </Button>
            </div>
          </div>
        </Card>
        
        {/* SECTION 7: Troubleshooting */}
        <Card className="border-destructive/30 bg-destructive/5" data-testid="card-danger-zone">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Troubleshooting</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium">Clear Stuck Positions</p>
                    <HelpTooltip testId="clear-positions" content="Removes all current position records from the database. Use if position data becomes corrupted or out of sync. Does NOT affect your actual Kraken holdings." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If positions appear stuck after switching between simulation and real mode, 
                    use this to clear the in-memory position tracker. This will reset entry prices 
                    and allow the bot to start fresh.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => clearPositionsMutation.mutate()}
                  disabled={clearPositionsMutation.isPending}
                  className="shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
                  data-testid="button-clear-positions"
                >
                  {clearPositionsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Clear Positions
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
