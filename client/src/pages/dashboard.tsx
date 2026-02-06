import { usePortfolio, useResetPortfolio } from "@/hooks/use-portfolio";
import { useBotSettings, useToggleBot } from "@/hooks/use-bot";
import { Layout } from "@/components/layout";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Loader2, PlayCircle, PauseCircle, Wallet, Activity, RotateCcw, TrendingUp, TrendingDown, AlertTriangle, AlertCircle, DollarSign, Brain, Zap, Wifi, WifiOff, Minus, Coins, BarChart3, LineChart, Settings, Clock } from "lucide-react";
import { format } from "date-fns";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { Link } from "wouter";

interface EnabledCoin {
  id: number;
  userId: string;
  symbol: string;
  krakenPair: string;
  tradeAmount: string | null;
  isEnabled: boolean;
}


interface MarketHotCoin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24hUSD: number;
  hotnessScore: number;
  volatility: number;
  momentum: number;
  volumeScore: number;
  isInUserCoins: boolean;
}

interface Position {
  symbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  valueUSD: number;
  profitLossPercent: number;
  profitLossUSD: number;
  stopLossPercent: number;
  stopLossPrice: number;
  takeProfitPercent: number;
  takeProfitPrice: number;
  quickProfitPercent: number;
  quickProfitPrice: number;
  enteredAt: string | null;
  timeToTargetMinutes?: number;
  entryConfidence?: number;
  isDustPosition?: boolean;
  minOrderAmount?: number;
}

interface PositionsData {
  positions: Position[];
  totalPositions: number;
  totalValueUSD: number;
  totalPLUSD: number;
  dustCount?: number;
  dustValueUSD?: number;
}

export default function Dashboard() {
  const [selectedCoin, setSelectedCoin] = useState<string>('ALL');
  const [countdown, setCountdown] = useState<number>(0);
  const [tabWasHidden, setTabWasHidden] = useState<boolean>(false);
  const { data: portfolio, isLoading: isPortfolioLoading } = usePortfolio();
  const { data: botSettings, isLoading: isSettingsLoading } = useBotSettings();
  const resetMutation = useResetPortfolio();
  const toggleMutation = useToggleBot();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resetPerformanceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/bot/reset-performance', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to reset performance');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bot/activity'] });
      toast({
        title: "Performance Reset",
        description: "All transaction history and AI learning data has been cleared.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reset performance metrics.",
        variant: "destructive",
      });
    },
  });

  const handleBotToggle = () => {
    if (botSettings) {
      toggleMutation.mutate(!botSettings.isActive);
    }
  };

  // Fetch enabled coins
  const { data: enabledCoins } = useQuery<EnabledCoin[]>({
    queryKey: ['/api/coins/enabled'],
    queryFn: async () => {
      const res = await fetch('/api/coins/enabled', { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });


  // Market-wide hot coins scanner
  const { data: marketHotCoins, isLoading: isMarketScanLoading, refetch: refetchMarketScan } = useQuery<{ 
    hotCoins: MarketHotCoin[]; 
    totalScanned: number; 
    userCoinsCount: number;
  }>({
    queryKey: ['/api/market/scan-hot-coins'],
    queryFn: async () => {
      const res = await fetch('/api/market/scan-hot-coins?limit=10', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to scan market");
      return res.json();
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });

  // Fetch active positions
  const { data: positionsData } = useQuery<PositionsData>({
    queryKey: ['/api/positions'],
    queryFn: async () => {
      const res = await fetch('/api/positions', { credentials: "include" });
      if (!res.ok) return { positions: [], totalPositions: 0, totalValueUSD: 0, totalPLUSD: 0 };
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Activity log query
  interface ActivityLogEntry {
    id: number;
    timestamp: string;
    type: 'info' | 'trade' | 'decision' | 'skip' | 'error' | 'price' | 'autopilot' | 'risk' | 'position';
    symbol?: string;
    message: string;
    details?: string;
  }

  const { data: activityData } = useQuery<{ entries: ActivityLogEntry[]; latestId: number; totalCount: number }>({
    queryKey: ['/api/bot/activity'],
    queryFn: async () => {
      const res = await fetch('/api/bot/activity?limit=50', { credentials: "include" });
      if (!res.ok) return { entries: [], latestId: 0, totalCount: 0 };
      return res.json();
    },
    refetchInterval: 3000,
  });

  const isSimulation = botSettings?.isSimulation ?? true;

  // Bot status query - polls every 5 seconds for live updates
  interface BotStatus {
    userId: string;
    symbol: string;
    strategy: string;
    action: 'buy' | 'sell' | 'hold';
    reasoning: string;
    price: number;
    timestamp: string;
    confidence?: number;
    isSimulation: boolean;
    nextAnalysisAt?: string;
    secondsUntilNextAnalysis?: number;
    lastAnalysisAt?: string | null;
  }
  
  // Fetch single coin status when not ALL
  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['/api/bot/status', selectedCoin],
    queryFn: async () => {
      const res = await fetch(`/api/bot/status?symbol=${selectedCoin}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bot status");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: selectedCoin !== 'ALL',
  });
  
  // Fetch all coin statuses when ALL is selected
  const { data: allBotStatuses, isLoading: isAllStatusesLoading } = useQuery<BotStatus[]>({
    queryKey: ['/api/bot/status', 'ALL'],
    queryFn: async () => {
      const res = await fetch('/api/bot/status?symbol=ALL', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch all bot statuses");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: selectedCoin === 'ALL',
  });

  // Countdown timer for next AI analysis
  useEffect(() => {
    const secondsFromApi = selectedCoin === 'ALL' 
      ? allBotStatuses?.[0]?.secondsUntilNextAnalysis ?? 0
      : botStatus?.secondsUntilNextAnalysis ?? 0;
    
    if (secondsFromApi > 0) {
      setCountdown(secondsFromApi);
    }
  }, [botStatus?.secondsUntilNextAnalysis, allBotStatuses, selectedCoin]);

  // Tick down the countdown every second
  useEffect(() => {
    if (countdown <= 0) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [countdown]);

  // Handle browser tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabWasHidden(true);
      } else if (tabWasHidden) {
        console.log('[VISIBILITY] Tab restored - refreshing all trading data...');
        queryClient.invalidateQueries({ queryKey: ['/api/bot/status'], exact: false });
        queryClient.invalidateQueries({ queryKey: ['/api/bot/activity'] });
        queryClient.invalidateQueries({ queryKey: ['/api/positions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/coins/balances'] });
        queryClient.invalidateQueries({ queryKey: ['/api/coins/enabled'] });
        queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
        queryClient.invalidateQueries({ queryKey: ['/api/portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['/api/market/scan-hot-coins'] });
        queryClient.invalidateQueries({ queryKey: ['/api/kraken/health'] });
        queryClient.invalidateQueries({ queryKey: ['/api/indicators'], exact: false });
        queryClient.invalidateQueries({ queryKey: ['/api/bot/settings'] });
        setTabWasHidden(false);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tabWasHidden, queryClient]);

  // Format countdown as mm:ss
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Kraken API health check - polls every 10 seconds
  interface ApiHealth {
    status: 'connected' | 'degraded' | 'disconnected';
    latency: number;
    price: number;
    timestamp: string;
    message?: string;
  }
  
  const { data: apiHealth } = useQuery<ApiHealth>({
    queryKey: ['/api/kraken/health'],
    queryFn: async () => {
      const res = await fetch('/api/kraken/health', { credentials: "include" });
      if (!res.ok) throw new Error("Failed to check API health");
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Technical indicators query
  interface TechnicalIndicators {
    symbol: string;
    available: boolean;
    dataPoints: number;
    rsi: number | null;
    sma20: number | null;
    sma50: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    trend: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    support: number | null;
    resistance: number | null;
    rsiInterpretation: string;
    macdSignalType: string;
    timestamp: string;
  }

  const { data: indicators } = useQuery<TechnicalIndicators>({
    queryKey: ['/api/indicators', selectedCoin],
    queryFn: async () => {
      const symbol = selectedCoin === 'ALL' ? 'KAS' : selectedCoin;
      const res = await fetch(`/api/indicators/${symbol}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch indicators");
      return res.json();
    },
    refetchInterval: 10000,
    enabled: selectedCoin !== 'ALL',
  });

  const { data: transactions, isLoading: isTransactionsLoading } = useQuery({
    queryKey: [api.transactions.list.path],
    queryFn: async () => {
      const res = await fetch(api.transactions.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return api.transactions.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
  });

  if (isPortfolioLoading || !portfolio) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter transactions to current session only
  const sessionTransactions = transactions?.filter(tx => {
    if (!botSettings?.sessionStartedAt || !botSettings?.isActive) {
      return false;
    }
    const sessionStart = new Date(botSettings.sessionStartedAt).getTime();
    const txTime = new Date(tx.timestamp!).getTime();
    const matchesCoin = selectedCoin === 'ALL' || tx.symbol === selectedCoin;
    return txTime >= sessionStart && matchesCoin;
  }) || [];

  // Calculate performance metrics from all transactions
  const calculatePerformanceMetrics = () => {
    if (!transactions || transactions.length === 0) {
      return { totalTrades: 0, winRatio: 0, profitPercent: 0, bestTrade: null, worstTrade: null };
    }
    
    const buys: Array<{ price: number; amount: number; symbol: string }> = [];
    const completedTrades: Array<{ profitPercent: number; profit: number; symbol: string }> = [];
    
    const sortedTx = [...transactions].sort((a, b) => 
      new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );
    
    for (const tx of sortedTx) {
      const price = Number(tx.price);
      const amount = Number(tx.amount);
      
      if (tx.type === 'buy') {
        buys.push({ price, amount, symbol: tx.symbol });
      } else if (tx.type === 'sell' && buys.length > 0) {
        const buyIndex = buys.findIndex(b => b.symbol === tx.symbol);
        if (buyIndex !== -1) {
          const buy = buys.splice(buyIndex, 1)[0];
          const profit = (price - buy.price) * amount;
          const profitPercent = ((price - buy.price) / buy.price) * 100;
          completedTrades.push({ profitPercent, profit, symbol: tx.symbol });
        }
      }
    }
    
    const wins = completedTrades.filter(t => t.profit > 0).length;
    const totalCompleted = completedTrades.length;
    
    const bestTrade = completedTrades.length > 0 
      ? completedTrades.reduce((best, t) => t.profitPercent > best.profitPercent ? t : best)
      : null;
    const worstTrade = completedTrades.length > 0
      ? completedTrades.reduce((worst, t) => t.profitPercent < worst.profitPercent ? t : worst)
      : null;
    
    const totalProfitPercent = completedTrades.reduce((sum, t) => sum + t.profitPercent, 0);
    
    return {
      totalTrades: transactions.length,
      completedTrades: totalCompleted,
      winRatio: totalCompleted > 0 ? (wins / totalCompleted) * 100 : 0,
      wins,
      losses: totalCompleted - wins,
      profitPercent: totalCompleted > 0 ? totalProfitPercent / totalCompleted : 0,
      bestTrade,
      worstTrade,
    };
  };
  
  const perfMetrics = calculatePerformanceMetrics();

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header with Bot Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 p-6 glass-card border-white/5 rounded-xl">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-colors duration-300 ${botSettings?.isActive ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display tracking-tight">Trading Dashboard</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${botSettings?.isActive ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {botSettings?.isActive ? "Bot Running" : "Bot Stopped"}
                </span>
                {botSettings?.isSimulation === false && (
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                    Real Trading
                  </Badge>
                )}
                {botSettings?.isActive && (activityData?.entries?.length ?? 0) > 0 && (() => {
                  const latestEntry = [...(activityData?.entries ?? [])].sort((a, b) => 
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                  )[0];
                  return latestEntry?.timestamp ? (
                    <span className="text-xs text-muted-foreground/60 ml-2" title="Trading continues even when this tab is minimized">
                      (Server active: {format(new Date(latestEntry.timestamp), 'HH:mm:ss')})
                    </span>
                  ) : null;
                })()}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 ml-auto">
            <Button
              size="lg"
              variant={botSettings?.isActive ? "destructive" : "default"}
              onClick={handleBotToggle}
              disabled={toggleMutation.isPending || isSettingsLoading}
              className={`min-w-[140px] font-semibold ${!botSettings?.isActive && "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white border-0"}`}
              data-testid="button-toggle-bot"
            >
              {toggleMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : botSettings?.isActive ? (
                <>
                  <PauseCircle className="w-5 h-5 mr-2" /> Stop Bot
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5 mr-2" /> Start Bot
                </>
              )}
            </Button>

            <div className="h-10 w-px bg-white/10 hidden md:block" />

            <div className="flex items-center gap-4">
              {/* Coin Selector */}
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-muted-foreground" />
                <Select value={selectedCoin} onValueChange={setSelectedCoin}>
                  <SelectTrigger className="w-28 h-10" data-testid="select-coin">
                    <SelectValue placeholder="Coin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Coins</SelectItem>
                    {enabledCoins?.map(coin => (
                      <SelectItem key={coin.symbol} value={coin.symbol}>
                        {coin.symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* API Connection Status */}
              <div 
                className={`flex items-center gap-2 h-10 px-3 rounded-lg border ${
                  apiHealth?.status === 'connected' 
                    ? 'border-green-500/30 bg-green-500/10' 
                    : apiHealth?.status === 'degraded'
                    ? 'border-yellow-500/30 bg-yellow-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
                data-testid="indicator-api-status"
              >
                {apiHealth?.status === 'connected' ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : apiHealth?.status === 'degraded' ? (
                  <Wifi className="w-4 h-4 text-yellow-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className={`text-xs font-medium ${
                  apiHealth?.status === 'connected' 
                    ? 'text-green-400' 
                    : apiHealth?.status === 'degraded'
                    ? 'text-yellow-400'
                    : 'text-red-400'
                }`}>
                  {apiHealth?.status === 'connected' 
                    ? `API ${apiHealth.latency}ms` 
                    : apiHealth?.status === 'degraded'
                    ? 'Cached'
                    : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Portfolio Value Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(() => {
            const currentValue = Number(portfolio.totalValue);
            const sessionStart = botSettings?.sessionStartValue ? Number(botSettings.sessionStartValue) : null;
            let percentChange = 0;
            let trend: 'up' | 'down' = 'up';
            
            if (sessionStart && sessionStart > 0) {
              percentChange = ((currentValue - sessionStart) / sessionStart) * 100;
              trend = percentChange >= 0 ? 'up' : 'down';
            }
            
            return (
              <StatCard
                title="Total Value"
                value={`$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                trend={trend}
                trendValue={sessionStart ? `${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%` : 'N/A'}
                icon={<Wallet className="w-12 h-12 text-primary" />}
                className="border-primary/20"
              />
            );
          })()}
        </div>

        {/* Performance & Technical Analysis Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Performance Section */}
          <Card className="glass-card p-4 border-white/5" data-testid="card-performance">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-semibold">Performance Metrics</h3>
              <span className="text-xs text-muted-foreground ml-auto">All Time</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Trades</span>
                <p className="text-xl font-bold" data-testid="text-total-trades">{perfMetrics.totalTrades}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Win Rate</span>
                <p className={`text-xl font-bold ${perfMetrics.winRatio >= 50 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-win-rate">
                  {perfMetrics.winRatio.toFixed(1)}%
                </p>
                <span className="text-xs text-muted-foreground">
                  {perfMetrics.wins}W / {perfMetrics.losses}L
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Best Trade</span>
                {perfMetrics.bestTrade ? (
                  <p className="text-lg font-bold text-green-400" data-testid="text-best-trade">
                    +{perfMetrics.bestTrade.profitPercent.toFixed(2)}%
                    <span className="text-xs text-muted-foreground ml-1">({perfMetrics.bestTrade.symbol})</span>
                  </p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">--</p>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Worst Trade</span>
                {perfMetrics.worstTrade ? (
                  <p className="text-lg font-bold text-red-400" data-testid="text-worst-trade">
                    {perfMetrics.worstTrade.profitPercent.toFixed(2)}%
                    <span className="text-xs text-muted-foreground ml-1">({perfMetrics.worstTrade.symbol})</span>
                  </p>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">--</p>
                )}
              </div>
            </div>
          </Card>

          {/* Technical Analysis Section */}
          <Card className="glass-card p-4 border-white/5" data-testid="card-technical-analysis">
            <div className="flex items-center gap-2 mb-4">
              <LineChart className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-semibold">Technical Analysis</h3>
              {indicators?.available && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                  {indicators.symbol}
                </span>
              )}
            </div>
            {selectedCoin === 'ALL' ? (
              <p className="text-sm text-muted-foreground">Select a specific coin to view technical indicators</p>
            ) : !indicators?.available ? (
              <p className="text-sm text-muted-foreground">Gathering price data... ({indicators?.dataPoints || 0} points)</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">RSI (14)</span>
                  <div className="flex items-center gap-2">
                    <p className={`text-lg font-bold ${
                      indicators.rsiInterpretation === 'overbought' || indicators.rsiInterpretation === 'slightly_overbought' 
                        ? 'text-red-400' 
                        : indicators.rsiInterpretation === 'oversold' || indicators.rsiInterpretation === 'slightly_oversold'
                        ? 'text-green-400'
                        : 'text-foreground'
                    }`}>
                      {indicators.rsi?.toFixed(1) || '--'}
                    </p>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                      indicators.rsiInterpretation === 'overbought' ? 'bg-red-500/20 text-red-400' :
                      indicators.rsiInterpretation === 'slightly_overbought' ? 'bg-orange-500/20 text-orange-400' :
                      indicators.rsiInterpretation === 'oversold' ? 'bg-green-500/20 text-green-400' :
                      indicators.rsiInterpretation === 'slightly_oversold' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {indicators.rsiInterpretation?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">MACD Signal</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      indicators.macdSignalType === 'bullish' ? 'bg-green-500/20 text-green-400' :
                      indicators.macdSignalType === 'bearish' ? 'bg-red-500/20 text-red-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {indicators.macdSignalType}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Trend</span>
                  <div className="flex items-center gap-2">
                    {indicators.trend === 'bullish' ? (
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    ) : indicators.trend === 'bearish' ? (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    ) : (
                      <Minus className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className={`text-sm font-medium ${
                      indicators.trend === 'bullish' ? 'text-green-400' :
                      indicators.trend === 'bearish' ? 'text-red-400' :
                      'text-muted-foreground'
                    }`}>
                      {indicators.trend?.charAt(0).toUpperCase() + indicators.trend?.slice(1)} ({indicators.strength})
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Support / Resistance</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-400">${indicators.support?.toFixed(5) || '--'}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-400">${indicators.resistance?.toFixed(5) || '--'}</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Bot Thinking Card */}
        <Card className="glass-card p-4 border-white/5" data-testid="card-bot-thinking">
          {selectedCoin === 'ALL' && isAllStatusesLoading ? (
            <div className="flex items-center gap-4 p-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Loading All Coins Status</h3>
                <p className="text-sm text-muted-foreground">Fetching status for all enabled coins...</p>
              </div>
            </div>
          ) : selectedCoin === 'ALL' && allBotStatuses && allBotStatuses.length === 0 ? (
            <div className="flex items-center gap-4 p-4">
              <AlertCircle className="w-8 h-8 text-yellow-500" />
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">No Coins Enabled</h3>
                <p className="text-sm text-muted-foreground">Go to Bot Config to enable coins for trading</p>
              </div>
            </div>
          ) : selectedCoin === 'ALL' && allBotStatuses && allBotStatuses.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {botSettings?.strategy === 'ai_trading' ? (
                  <Brain className="w-5 h-5 text-purple-400" />
                ) : (
                  <Zap className="w-5 h-5 text-blue-400" />
                )}
                <h3 className="text-sm font-semibold text-muted-foreground">All Coins Status</h3>
                {botSettings?.strategy === 'ai_trading' && (
                  <span 
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      countdown > 0 
                        ? 'bg-purple-500/20 text-purple-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}
                    data-testid="text-next-analysis-countdown-all"
                  >
                    {countdown > 0 
                      ? `Next analysis: ${formatCountdown(countdown)}` 
                      : 'Analyzing...'}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {botSettings?.strategy?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown'}
                </span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allBotStatuses.map((status) => (
                  <div 
                    key={status.symbol} 
                    className={`p-2 rounded-lg border ${
                      status.action === 'buy' ? 'border-green-500/30 bg-green-500/10' :
                      status.action === 'sell' ? 'border-red-500/30 bg-red-500/10' :
                      'border-blue-500/30 bg-blue-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{status.symbol}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          status.action === 'buy' ? 'bg-green-500/20 text-green-400' :
                          status.action === 'sell' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {status.action?.toUpperCase()}
                        </span>
                        {(status as any).aiSelectedStrategy && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                            {(status as any).aiSelectedStrategy.replace(/_/g, ' ')}
                          </span>
                        )}
                        {status.confidence !== undefined && status.confidence > 0 && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                            status.confidence >= 60 ? 'bg-green-500/20 text-green-400' :
                            status.confidence >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`} data-testid={`confidence-${status.symbol}`}>
                            {status.confidence}%
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          ${status.price?.toFixed(5)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {status.timestamp ? format(new Date(status.timestamp), 'HH:mm:ss') : '--:--'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {status.reasoning}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${
                botStatus?.action === 'buy' ? 'bg-green-500/20 text-green-400' :
                botStatus?.action === 'sell' ? 'bg-red-500/20 text-red-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {botSettings?.strategy === 'ai_trading' ? (
                  <Brain className="w-8 h-8" />
                ) : (
                  <Zap className="w-8 h-8" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-sm font-semibold text-muted-foreground">Bot Thinking</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    botStatus?.action === 'buy' ? 'bg-green-500/20 text-green-400' :
                    botStatus?.action === 'sell' ? 'bg-red-500/20 text-red-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {botStatus?.action?.toUpperCase() || 'WAITING'}
                  </span>
                  {(botStatus as any)?.aiSelectedStrategy && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400" data-testid="text-ai-strategy">
                      {(botStatus as any).aiSelectedStrategy.replace(/_/g, ' ')}
                    </span>
                  )}
                  {botStatus?.confidence && (
                    <span className="text-xs text-muted-foreground">
                      {botStatus.confidence}% confidence
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {botStatus?.strategy?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown'}
                  </span>
                </div>
                <p className="text-sm text-foreground" data-testid="text-bot-reasoning">
                  {botStatus?.reasoning || 'Waiting for bot to analyze market conditions...'}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                  <span>Price: ${botStatus?.price?.toFixed(5) || '0.00000'}</span>
                  <span>
                    Updated: {botStatus?.timestamp 
                      ? format(new Date(botStatus.timestamp), 'HH:mm:ss') 
                      : '--:--:--'}
                  </span>
                  {botSettings?.strategy === 'ai_trading' && (
                    <span 
                      className={`px-2 py-0.5 rounded font-medium ${
                        countdown > 0 
                          ? 'bg-purple-500/20 text-purple-400' 
                          : 'bg-green-500/20 text-green-400'
                      }`}
                      data-testid="text-next-analysis-countdown"
                    >
                      {countdown > 0 
                        ? `Next analysis: ${formatCountdown(countdown)}` 
                        : 'Analyzing...'}
                    </span>
                  )}
                  {botStatus?.isSimulation && (
                    <span className="text-yellow-500">Simulation</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Session Transactions & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[400px]">
          {/* Session Transactions Card */}
          <Card className="lg:col-span-2 glass-card border-white/5 overflow-hidden flex flex-col" data-testid="card-session-transactions">
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-semibold">Session Transactions</h3>
              </div>
              <span className="text-xs text-muted-foreground">
                Showing last 10
              </span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="text-left text-muted-foreground border-b border-white/5 bg-background">
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">Symbol</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Amount</th>
                    <th className="p-3 font-medium text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isTransactionsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      </td>
                    </tr>
                  ) : sessionTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No transactions in current session.
                      </td>
                    </tr>
                  ) : (
                    sessionTransactions.slice(0, 10).map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {tx.timestamp ? format(new Date(tx.timestamp), "HH:mm:ss") : "--:--:--"}
                        </td>
                        <td className="p-3 font-medium">{tx.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tx.type === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{Number(tx.amount).toFixed(4)}</td>
                        <td className="p-3 text-right font-mono">${Number(tx.price).toFixed(5)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 text-center border-t border-white/5 bg-white/5 shrink-0">
              <p className="text-xs text-muted-foreground">
                Total Session Trades: {sessionTransactions.length}
              </p>
            </div>
          </Card>

          {/* Quick Actions Card */}
          <Card className="glass-card p-6 border-white/5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Quick Actions</h3>
            </div>
            
            <div className="flex-1 space-y-4">
              {/* Current Mode Display */}
              <div className="p-4 rounded-lg bg-accent/30 border border-accent/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Trading Mode</span>
                  <Badge variant={isSimulation ? "secondary" : "destructive"}>
                    {isSimulation ? "Simulation" : "Real Trading"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isSimulation 
                    ? "Using virtual funds for testing" 
                    : "Connected to Kraken - real funds in use"}
                </p>
              </div>

              {/* Current Strategy Display */}
              <div className="p-4 rounded-lg bg-accent/30 border border-accent/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Strategy</span>
                  <Badge variant="outline">
                    {botSettings?.strategy?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Not Set'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Risk Level: {botSettings?.riskLevel?.charAt(0).toUpperCase()}{botSettings?.riskLevel?.slice(1) || 'Medium'}
                </p>
              </div>

              {/* Market Scanner Preview */}
              <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-medium">Market Scanner</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchMarketScan()}
                    disabled={isMarketScanLoading}
                    className="h-6 text-xs"
                    data-testid="button-refresh-market-scan"
                  >
                    {isMarketScanLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                  </Button>
                </div>
                {marketHotCoins?.hotCoins?.slice(0, 3).map((coin) => (
                  <div key={coin.symbol} className="flex items-center justify-between py-1 text-xs">
                    <span className="font-medium">{coin.symbol}</span>
                    <span className={coin.change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {coin.change24h >= 0 ? '+' : ''}{coin.change24h.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-white/10">
              {isSimulation && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                  className="w-full gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary"
                  data-testid="button-reset-simulation"
                >
                  <RotateCcw className="w-3 h-3" /> Reset Simulation
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={resetPerformanceMutation.isPending}
                    className="w-full gap-2 border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    data-testid="button-reset-performance"
                  >
                    <Trash2 className="w-3 h-3" /> Reset Performance
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Performance Data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all transaction history and clear the AI's learning data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => resetPerformanceMutation.mutate()}
                      className="bg-destructive hover:bg-destructive/90"
                      data-testid="button-confirm-reset-performance"
                    >
                      {resetPerformanceMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resetting...</>
                      ) : (
                        'Reset All'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button className="w-full" asChild data-testid="button-open-settings">
                <Link to="/bot">
                  <Settings className="w-4 h-4 mr-2" /> Open Bot Settings
                </Link>
              </Button>
            </div>
          </Card>
        </div>

        {/* Active Positions */}
        {positionsData && positionsData.positions.length > 0 && (
          <Card className="glass-card p-6 border-white/5 mt-8" data-testid="active-positions-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <LineChart className="w-5 h-5 text-primary" />
                Active Positions
              </h3>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {positionsData.totalPositions} positions
                </span>
                <span className={`text-sm font-mono ${positionsData.totalPLUSD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {positionsData.totalPLUSD >= 0 ? '+' : ''}{positionsData.totalPLUSD.toFixed(2)} USD
                </span>
              </div>
            </div>
            <div className="grid gap-3">
              {positionsData.positions.map((position) => (
                <div 
                  key={position.symbol}
                  className={`p-4 rounded-lg border ${position.profitLossPercent >= 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}
                  data-testid={`position-${position.symbol}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="font-semibold text-lg">{position.symbol}</div>
                      <Badge className={position.profitLossPercent >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                        {position.profitLossPercent >= 0 ? '+' : ''}{position.profitLossPercent.toFixed(2)}%
                      </Badge>
                      {position.isDustPosition && (
                        <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Dust
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">${position.valueUSD.toFixed(2)}</div>
                      <div className={`text-xs ${position.profitLossPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {position.profitLossUSD >= 0 ? '+' : ''}{position.profitLossUSD.toFixed(2)} USD
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-background/50 p-2 rounded">
                      <div className="text-muted-foreground mb-1">Entry Price</div>
                      <div className="font-mono font-medium">
                        {position.entryPrice > 0 ? `$${position.entryPrice.toFixed(5)}` : 'N/A'}
                      </div>
                    </div>
                    <div className="bg-background/50 p-2 rounded">
                      <div className="text-muted-foreground mb-1">Current Price</div>
                      <div className="font-mono font-medium">${position.currentPrice.toFixed(5)}</div>
                    </div>
                    <div className="bg-red-500/10 p-2 rounded border border-red-500/20">
                      <div className="text-red-400 mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Stop Loss ({position.stopLossPercent}%)
                      </div>
                      <div className="font-mono font-medium text-red-300">
                        {position.stopLossPrice > 0 ? `$${position.stopLossPrice.toFixed(5)}` : 'N/A'}
                      </div>
                    </div>
                    <div className="bg-green-500/10 p-2 rounded border border-green-500/20">
                      <div className="text-green-400 mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        Take Profit ({position.takeProfitPercent}%)
                      </div>
                      <div className="font-mono font-medium text-green-300">
                        {position.takeProfitPrice > 0 ? `$${position.takeProfitPrice.toFixed(5)}` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {position.quickProfitPrice > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Zap className="w-3 h-3 text-yellow-400" />
                      Quick Profit Target ({position.quickProfitPercent}%): 
                      <span className="font-mono text-yellow-400">${position.quickProfitPrice.toFixed(5)}</span>
                    </div>
                  )}
                  
                  {position.entryConfidence !== undefined && position.entryConfidence > 0 && (
                    <div className="mt-2 text-xs flex items-center gap-2">
                      <Brain className="w-3 h-3 text-purple-400" />
                      <span className="text-muted-foreground">Entry Confidence:</span>
                      <span className={`font-mono font-medium ${
                        position.entryConfidence >= 70 ? 'text-green-400' : 
                        position.entryConfidence >= 50 ? 'text-yellow-400' : 'text-orange-400'
                      }`}>
                        {position.entryConfidence}%
                      </span>
                    </div>
                  )}
                  
                  {position.timeToTargetMinutes !== undefined && position.timeToTargetMinutes > 0 && (
                    <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <div className="text-xs">
                        <span className="text-blue-300">Est. time to TP:</span>
                        <span className="font-mono font-medium text-blue-400 ml-2">
                          {position.timeToTargetMinutes < 60 
                            ? `${position.timeToTargetMinutes}m`
                            : position.timeToTargetMinutes < 1440
                              ? `${Math.floor(position.timeToTargetMinutes / 60)}h ${position.timeToTargetMinutes % 60}m`
                              : `${Math.floor(position.timeToTargetMinutes / 1440)}d ${Math.floor((position.timeToTargetMinutes % 1440) / 60)}h`
                          }
                        </span>
                        <span className={`ml-2 text-xs ${
                          position.profitLossPercent > 0 ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {position.profitLossPercent > 0 ? '(on track)' : '(waiting for momentum)'}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-muted-foreground">
                    Amount: <span className="font-mono">{position.amount.toFixed(6)} {position.symbol}</span>
                    {position.enteredAt && (
                      <span className="ml-3 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {(() => {
                          const entryDate = new Date(position.enteredAt);
                          const now = new Date();
                          const diffMs = now.getTime() - entryDate.getTime();
                          const diffMins = Math.floor(diffMs / (1000 * 60));
                          const diffHours = Math.floor(diffMins / 60);
                          
                          if (diffMins < 1) return 'Just now';
                          if (diffMins < 60) return `${diffMins}m ago`;
                          if (diffHours < 24) return `${diffHours}h ago`;
                          return format(entryDate, 'MMM d, HH:mm');
                        })()}
                      </span>
                    )}
                  </div>
                  
                  {position.isDustPosition && position.minOrderAmount && (
                    <div className="mt-2 text-xs text-orange-400 bg-orange-500/10 p-2 rounded">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      Position below minimum sell order ({position.minOrderAmount} {position.symbol} required). Cannot be sold automatically.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Activity Log */}
        <Card className="glass-card p-6 border-white/5 mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Bot Activity Log
            </h3>
            <span className="text-xs text-muted-foreground">
              {activityData?.totalCount || 0} entries
            </span>
          </div>
          <div 
            className="h-[300px] overflow-y-auto space-y-2 font-mono text-xs"
            data-testid="activity-log-container"
          >
            {(!activityData?.entries || activityData.entries.length === 0) ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Waiting for bot activity...</p>
                  <p className="text-xs mt-1">Logs will appear here when the bot is running</p>
                </div>
              </div>
            ) : (
              activityData.entries
                .filter(entry => entry.type !== 'decision' && entry.type !== 'price')
                .map((entry) => {
                const time = new Date(entry.timestamp);
                const timeStr = format(time, 'HH:mm:ss');
                
                let bgColor = 'bg-secondary/30';
                let textColor = 'text-muted-foreground';
                let icon = null;
                
                switch (entry.type) {
                  case 'trade':
                    bgColor = entry.message.includes('BUY') 
                      ? 'bg-green-500/10 border-l-2 border-green-500' 
                      : 'bg-red-500/10 border-l-2 border-red-500';
                    textColor = entry.message.includes('BUY') ? 'text-green-400' : 'text-red-400';
                    icon = entry.message.includes('BUY') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />;
                    break;
                  case 'decision':
                    bgColor = 'bg-blue-500/10 border-l-2 border-blue-500';
                    textColor = 'text-blue-400';
                    icon = <Brain className="w-3 h-3" />;
                    break;
                  case 'skip':
                    bgColor = 'bg-yellow-500/10 border-l-2 border-yellow-500';
                    textColor = 'text-yellow-400';
                    icon = <AlertTriangle className="w-3 h-3" />;
                    break;
                  case 'error':
                    bgColor = 'bg-red-500/10 border-l-2 border-red-500';
                    textColor = 'text-red-400';
                    icon = <AlertCircle className="w-3 h-3" />;
                    break;
                  case 'price':
                    bgColor = 'bg-secondary/20';
                    textColor = 'text-muted-foreground';
                    icon = <DollarSign className="w-3 h-3" />;
                    break;
                  case 'position':
                    bgColor = 'bg-purple-500/10 border-l-2 border-purple-500';
                    textColor = 'text-purple-400';
                    icon = <LineChart className="w-3 h-3" />;
                    break;
                  case 'info':
                  default:
                    icon = <Zap className="w-3 h-3" />;
                    break;
                }
                
                return (
                  <div 
                    key={entry.id}
                    className={`${bgColor} rounded px-3 py-2 flex flex-col gap-1`}
                    data-testid={`activity-entry-${entry.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">[{timeStr}]</span>
                      {icon}
                      {entry.symbol && (
                        <span className="font-medium">{entry.symbol}</span>
                      )}
                      <span className={textColor}>{entry.message}</span>
                    </div>
                    {entry.details && (
                      <div className="text-muted-foreground pl-16 text-[10px]">
                        {entry.details}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
