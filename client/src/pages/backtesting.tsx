import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { 
  FlaskConical, 
  Play, 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  Trash2,
  BarChart3,
  Target,
  AlertTriangle,
  DollarSign,
  Clock,
  Percent,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format } from "date-fns";

interface BacktestResult {
  id: number;
  name: string;
  symbol: string;
  strategy: string;
  startDate: string;
  endDate: string;
  startingBalance: string;
  endingBalance: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: string;
  totalProfitLoss: string;
  totalProfitLossPercent: string;
  maxDrawdown: string;
  maxDrawdownPercent: string;
  sharpeRatio: string;
  profitFactor: string;
  avgWin: string;
  avgLoss: string;
  largestWin: string;
  largestLoss: string;
  avgHoldingTimeMinutes: number;
  tradesJson: string;
  equityCurveJson: string;
  createdAt: string;
}

const AVAILABLE_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT', 'AVAX', 'LINK', 'ATOM', 'UNI', 'KAS', 'DOGE', 'LTC', 'ALGO', 'POL'];

export default function BacktestingPage() {
  const { toast } = useToast();
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTC");
  const [strategy, setStrategy] = useState("momentum");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startingBalance, setStartingBalance] = useState("10000");
  const [stopLossPercent, setStopLossPercent] = useState("2");
  const [takeProfitPercent, setTakeProfitPercent] = useState("5");
  const [tradeAmount, setTradeAmount] = useState("500");
  
  // Strategy-specific params
  const [momentumPeriod, setMomentumPeriod] = useState("10");
  const [momentumThreshold, setMomentumThreshold] = useState("2");
  const [rsiPeriod, setRsiPeriod] = useState("14");
  const [rsiOversold, setRsiOversold] = useState("30");
  const [rsiOverbought, setRsiOverbought] = useState("70");
  const [emaFast, setEmaFast] = useState("9");
  const [emaSlow, setEmaSlow] = useState("21");
  const [scalpingTargetPercent, setScalpingTargetPercent] = useState("0.5");
  const [scalpingStopPercent, setScalpingStopPercent] = useState("0.3");
  
  // AI-specific params
  const [aiConfidenceThreshold, setAiConfidenceThreshold] = useState("65");
  
  // AI Scalper Pro params
  const [aiScalperTrailingPercent, setAiScalperTrailingPercent] = useState("0.2");
  const [aiScalperTimeoutMinutes, setAiScalperTimeoutMinutes] = useState("15");
  const [aiScalperMinSpread, setAiScalperMinSpread] = useState("0.1");
  const [aiScalperVolumeMultiplier, setAiScalperVolumeMultiplier] = useState("1.5");
  const [aiScalperEmaFast, setAiScalperEmaFast] = useState("9");
  const [aiScalperEmaSlow, setAiScalperEmaSlow] = useState("21");
  const [aiScalperRsiOversold, setAiScalperRsiOversold] = useState("30");
  const [aiScalperAntiChopAtr, setAiScalperAntiChopAtr] = useState("0.15");
  
  // Progress tracking
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Fetch existing results
  const { data: results, isLoading } = useQuery<BacktestResult[]>({
    queryKey: ['/api/backtest/results'],
  });
  
  // Poll for real progress from server
  const fetchProgress = async () => {
    try {
      const response = await fetch('/api/backtest/progress', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.active) {
          setProgress(data.percent);
          setProgressMessage(data.message);
          // Add details about candles if available
          if (data.currentCandle > 0 && data.totalCandles > 0) {
            const candleInfo = ` (${data.currentCandle}/${data.totalCandles} candles)`;
            if (!data.message.includes('candle')) {
              setProgressMessage(data.message + candleInfo);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    }
  };
  
  // Start polling for real progress
  const startProgress = () => {
    setProgress(0);
    setProgressMessage("Initializing backtest...");
    startTimeRef.current = Date.now();
    
    // Poll server for real progress every 500ms
    progressIntervalRef.current = setInterval(fetchProgress, 500);
  };
  
  // Stop progress polling
  const stopProgress = (success: boolean) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (success) {
      setProgress(100);
      setProgressMessage("Backtest complete!");
      setTimeout(() => {
        setProgress(0);
        setProgressMessage("");
      }, 2000);
    } else {
      setProgress(0);
      setProgressMessage("");
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);
  
  // Run backtest mutation
  const runBacktestMutation = useMutation({
    mutationFn: async (config: any) => {
      startProgress();
      const response = await apiRequest('POST', '/api/backtest/run', config);
      return response.json();
    },
    onSuccess: (data) => {
      stopProgress(true);
      toast({
        title: "Backtest Complete",
        description: `${data.result.totalTrades} trades, ${parseFloat(data.result.winRate).toFixed(1)}% win rate, ${parseFloat(data.result.totalProfitLossPercent).toFixed(2)}% return`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/backtest/results'] });
    },
    onError: (error: any) => {
      stopProgress(false);
      toast({
        title: "Backtest Failed",
        description: error.message || "Failed to run backtest",
        variant: "destructive",
      });
    },
  });
  
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/backtest/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/backtest/results'] });
      toast({ title: "Backtest deleted" });
    },
  });
  
  const handleRunBacktest = () => {
    if (!name || !startDate || !endDate) {
      toast({
        title: "Missing fields",
        description: "Please fill in name, start date, and end date",
        variant: "destructive",
      });
      return;
    }
    
    runBacktestMutation.mutate({
      name,
      symbol,
      strategy,
      startDate,
      endDate,
      startingBalance: parseFloat(startingBalance),
      stopLossPercent: parseFloat(stopLossPercent),
      takeProfitPercent: parseFloat(takeProfitPercent),
      tradeAmount: parseFloat(tradeAmount),
      momentumPeriod: parseInt(momentumPeriod),
      momentumThreshold: parseFloat(momentumThreshold),
      rsiPeriod: parseInt(rsiPeriod),
      rsiOversold: parseInt(rsiOversold),
      rsiOverbought: parseInt(rsiOverbought),
      emaFast: parseInt(emaFast),
      emaSlow: parseInt(emaSlow),
      scalpingTargetPercent: parseFloat(scalpingTargetPercent),
      scalpingStopPercent: parseFloat(scalpingStopPercent),
      aiConfidenceThreshold: parseInt(aiConfidenceThreshold),
      aiScalperTrailingPercent: parseFloat(aiScalperTrailingPercent),
      aiScalperTimeoutMinutes: parseInt(aiScalperTimeoutMinutes),
      aiScalperMinSpread: parseFloat(aiScalperMinSpread),
      aiScalperVolumeMultiplier: parseFloat(aiScalperVolumeMultiplier),
      aiScalperEmaFast: parseInt(aiScalperEmaFast),
      aiScalperEmaSlow: parseInt(aiScalperEmaSlow),
      aiScalperRsiOversold: parseInt(aiScalperRsiOversold),
      aiScalperAntiChopAtr: parseFloat(aiScalperAntiChopAtr),
    });
  };
  
  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Backtesting Engine</h1>
            <p className="text-muted-foreground">Test trading strategies against historical data</p>
          </div>
        </div>
        
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <Card className="p-6 lg:col-span-1">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Configuration
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Backtest Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., BTC Momentum Test"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-backtest-name"
                />
              </div>
              
              <div>
                <Label htmlFor="symbol">Coin</Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger data-testid="select-symbol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_COINS.map((coin) => (
                      <SelectItem key={coin} value={coin}>{coin}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="strategy">Strategy</Label>
                <Select value={strategy} onValueChange={setStrategy}>
                  <SelectTrigger data-testid="select-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="signal_only">Signal-Only (FAST)</SelectItem>
                    <SelectItem value="ai">AI-Powered (GPT)</SelectItem>
                    <SelectItem value="ai_scalper">AI Scalper Pro</SelectItem>
                    <SelectItem value="momentum">Momentum</SelectItem>
                    <SelectItem value="mean_reversion">Mean Reversion (RSI)</SelectItem>
                    <SelectItem value="scalping">Scalping (EMA)</SelectItem>
                    <SelectItem value="combined">Combined Signals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    data-testid="input-end-date"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="startingBalance">Starting Balance ($)</Label>
                <Input
                  id="startingBalance"
                  type="number"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  data-testid="input-starting-balance"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="stopLoss">Stop Loss %</Label>
                  <Input
                    id="stopLoss"
                    type="number"
                    step="0.1"
                    value={stopLossPercent}
                    onChange={(e) => setStopLossPercent(e.target.value)}
                    data-testid="input-stop-loss"
                  />
                </div>
                <div>
                  <Label htmlFor="takeProfit">Take Profit %</Label>
                  <Input
                    id="takeProfit"
                    type="number"
                    step="0.1"
                    value={takeProfitPercent}
                    onChange={(e) => setTakeProfitPercent(e.target.value)}
                    data-testid="input-take-profit"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="tradeAmount">Trade Amount ($)</Label>
                <Input
                  id="tradeAmount"
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  data-testid="input-trade-amount"
                />
              </div>
              
              {/* Strategy-specific parameters */}
              {strategy === 'momentum' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <p className="text-sm font-medium">Momentum Parameters</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Period</Label>
                      <Input type="number" value={momentumPeriod} onChange={(e) => setMomentumPeriod(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Threshold %</Label>
                      <Input type="number" step="0.1" value={momentumThreshold} onChange={(e) => setMomentumThreshold(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
              
              {strategy === 'mean_reversion' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <p className="text-sm font-medium">RSI Parameters</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Period</Label>
                      <Input type="number" value={rsiPeriod} onChange={(e) => setRsiPeriod(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Oversold</Label>
                      <Input type="number" value={rsiOversold} onChange={(e) => setRsiOversold(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Overbought</Label>
                      <Input type="number" value={rsiOverbought} onChange={(e) => setRsiOverbought(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
              
              {strategy === 'scalping' && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                  <p className="text-sm font-medium">Scalping Parameters</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">EMA Fast</Label>
                      <Input type="number" value={emaFast} onChange={(e) => setEmaFast(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">EMA Slow</Label>
                      <Input type="number" value={emaSlow} onChange={(e) => setEmaSlow(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Target %</Label>
                      <Input type="number" step="0.1" value={scalpingTargetPercent} onChange={(e) => setScalpingTargetPercent(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Stop %</Label>
                      <Input type="number" step="0.1" value={scalpingStopPercent} onChange={(e) => setScalpingStopPercent(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
              
              {strategy === 'ai' && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <span className="text-primary">AI-Powered Strategy</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uses your custom AI model to analyze technical indicators (RSI, MACD, EMA, Bollinger Bands, Volume) and make trading decisions.
                  </p>
                  <div>
                    <Label className="text-xs">Confidence Threshold (%)</Label>
                    <Input 
                      type="number" 
                      min="50" 
                      max="95" 
                      value={aiConfidenceThreshold} 
                      onChange={(e) => setAiConfidenceThreshold(e.target.value)} 
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Only trade when AI confidence exceeds this threshold (50-95%)
                    </p>
                  </div>
                </div>
              )}
              
              {strategy === 'ai_scalper' && (
                <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <span className="text-orange-500">AI Scalper Pro</span>
                    <span className="text-xs bg-orange-500/20 px-1.5 py-0.5 rounded">Aggressive</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uses your custom AI with short-term scalping indicators (5m/15m/30m timeframes). Features trailing stop-loss and position timeout.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Stop Loss %</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={scalpingStopPercent} 
                        onChange={(e) => setScalpingStopPercent(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Take Profit %</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={scalpingTargetPercent} 
                        onChange={(e) => setScalpingTargetPercent(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Trailing Stop %</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={aiScalperTrailingPercent} 
                        onChange={(e) => setAiScalperTrailingPercent(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Timeout (min)</Label>
                      <Input 
                        type="number" 
                        value={aiScalperTimeoutMinutes} 
                        onChange={(e) => setAiScalperTimeoutMinutes(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">AI Confidence Threshold (%)</Label>
                    <Input 
                      type="number" 
                      min="40" 
                      max="90" 
                      value={aiConfidenceThreshold} 
                      onChange={(e) => setAiConfidenceThreshold(e.target.value)} 
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Lower threshold (55% default) for more frequent scalping trades
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-orange-500/20">
                    <div>
                      <Label className="text-xs">Min Spread %</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={aiScalperMinSpread} 
                        onChange={(e) => setAiScalperMinSpread(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Volume Mult</Label>
                      <Input 
                        type="number" 
                        step="0.1"
                        value={aiScalperVolumeMultiplier} 
                        onChange={(e) => setAiScalperVolumeMultiplier(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Anti-Chop ATR %</Label>
                      <Input 
                        type="number" 
                        step="0.01"
                        value={aiScalperAntiChopAtr} 
                        onChange={(e) => setAiScalperAntiChopAtr(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">EMA Fast</Label>
                      <Input 
                        type="number"
                        value={aiScalperEmaFast} 
                        onChange={(e) => setAiScalperEmaFast(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">EMA Slow</Label>
                      <Input 
                        type="number"
                        value={aiScalperEmaSlow} 
                        onChange={(e) => setAiScalperEmaSlow(e.target.value)} 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">RSI Oversold</Label>
                      <Input 
                        type="number"
                        value={aiScalperRsiOversold} 
                        onChange={(e) => setAiScalperRsiOversold(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <Button 
                className="w-full" 
                onClick={handleRunBacktest}
                disabled={runBacktestMutation.isPending}
                data-testid="button-run-backtest"
              >
                {runBacktestMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" /> Run Backtest</>
                )}
              </Button>
              
              {/* Progress Bar */}
              {(runBacktestMutation.isPending || progress > 0) && (
                <div className="mt-4 space-y-2" data-testid="backtest-progress">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{progressMessage}</span>
                    <span className="font-medium">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  {strategy === 'ai' || strategy === 'ai_scalper' ? (
                    <p className="text-xs text-muted-foreground">
                      AI strategies may take 30-60 seconds depending on date range
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Estimated time: 10-15 seconds
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>
          
          {/* Results Panel */}
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Backtest Results
            </h2>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !results || results.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No backtest results yet</p>
                <p className="text-sm">Configure and run a backtest to see results here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result) => {
                  const isExpanded = expandedResult === result.id;
                  const pnl = parseFloat(result.totalProfitLoss);
                  const pnlPercent = parseFloat(result.totalProfitLossPercent);
                  const winRate = parseFloat(result.winRate);
                  const trades = result.tradesJson ? JSON.parse(result.tradesJson) : [];
                  
                  return (
                    <div 
                      key={result.id}
                      className={`border rounded-lg transition-all ${pnl >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}
                      data-testid={`backtest-result-${result.id}`}
                    >
                      {/* Summary Row */}
                      <div 
                        className="p-4 cursor-pointer hover-elevate"
                        onClick={() => setExpandedResult(isExpanded ? null : result.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{result.symbol}</Badge>
                            <span className="font-medium">{result.name}</span>
                            <Badge className="text-xs">{result.strategy}</Badge>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className={`font-mono font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">{winRate.toFixed(0)}% win</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
                          <span>{result.totalTrades} trades</span>
                          <span>{format(new Date(result.startDate), 'MMM d')} - {format(new Date(result.endDate), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t p-4 bg-muted/20">
                          <Tabs defaultValue="metrics">
                            <TabsList className="mb-4">
                              <TabsTrigger value="metrics">Metrics</TabsTrigger>
                              <TabsTrigger value="trades">Trades ({trades.length})</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="metrics">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" /> P/L
                                  </div>
                                  <div className={`font-mono font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ${pnl.toFixed(2)}
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Percent className="w-3 h-3" /> Win Rate
                                  </div>
                                  <div className="font-mono font-semibold">
                                    {winRate.toFixed(1)}%
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Max Drawdown
                                  </div>
                                  <div className="font-mono font-semibold text-red-400">
                                    -{parseFloat(result.maxDrawdownPercent).toFixed(2)}%
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <BarChart3 className="w-3 h-3" /> Sharpe Ratio
                                  </div>
                                  <div className="font-mono font-semibold">
                                    {parseFloat(result.sharpeRatio).toFixed(2)}
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground">Profit Factor</div>
                                  <div className="font-mono">
                                    {parseFloat(result.profitFactor).toFixed(2)}
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <TrendingUp className="w-3 h-3" /> Avg Win
                                  </div>
                                  <div className="font-mono text-green-400">
                                    ${parseFloat(result.avgWin).toFixed(2)}
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <TrendingDown className="w-3 h-3" /> Avg Loss
                                  </div>
                                  <div className="font-mono text-red-400">
                                    ${parseFloat(result.avgLoss).toFixed(2)}
                                  </div>
                                </div>
                                
                                <div className="p-3 bg-background rounded-lg">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Avg Hold Time
                                  </div>
                                  <div className="font-mono">
                                    {result.avgHoldingTimeMinutes}m
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-4 grid grid-cols-2 gap-4">
                                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                                  <div className="text-xs text-green-400">Largest Win</div>
                                  <div className="font-mono font-semibold text-green-400">
                                    ${parseFloat(result.largestWin).toFixed(2)}
                                  </div>
                                </div>
                                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                                  <div className="text-xs text-red-400">Largest Loss</div>
                                  <div className="font-mono font-semibold text-red-400">
                                    ${parseFloat(result.largestLoss).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
                                <span>
                                  Balance: ${parseFloat(result.startingBalance).toFixed(0)} → ${parseFloat(result.endingBalance).toFixed(2)}
                                </span>
                                <span>
                                  Created: {format(new Date(result.createdAt), 'MMM d, yyyy HH:mm')}
                                </span>
                              </div>
                            </TabsContent>
                            
                            <TabsContent value="trades">
                              <div className="max-h-[300px] overflow-y-auto space-y-1">
                                {trades.map((trade: any, idx: number) => (
                                  <div 
                                    key={idx}
                                    className={`flex items-center justify-between p-2 rounded text-xs font-mono ${
                                      trade.type === 'buy' ? 'bg-green-500/10' : 'bg-red-500/10'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {trade.type === 'buy' ? (
                                        <TrendingUp className="w-3 h-3 text-green-400" />
                                      ) : (
                                        <TrendingDown className="w-3 h-3 text-red-400" />
                                      )}
                                      <span className={trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}>
                                        {trade.type.toUpperCase()}
                                      </span>
                                      <span>${trade.price.toFixed(2)}</span>
                                      <span className="text-muted-foreground">{trade.reason}</span>
                                    </div>
                                    {trade.profitLoss !== undefined && (
                                      <span className={trade.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}>
                                        {trade.profitLoss >= 0 ? '+' : ''}{trade.profitLoss.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </TabsContent>
                          </Tabs>
                          
                          <div className="mt-4 flex justify-end">
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(result.id);
                              }}
                              data-testid={`button-delete-${result.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
