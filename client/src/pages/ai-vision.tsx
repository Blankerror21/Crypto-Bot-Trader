import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  BarChart3,
  Eye,
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Gauge,
  LineChart,
  CandlestickChart as CandlestickIcon,
  BookOpen,
  Target,
  Flame,
  Thermometer
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from "recharts";

interface EnabledCoin {
  id: number;
  userId: string;
  symbol: string;
  krakenPair: string;
  tradeAmount: string | null;
  isEnabled: boolean;
}

interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface TimeframeSignal {
  timeframe: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  rsi?: number;
  macdSignal?: 'bullish' | 'bearish' | 'neutral';
  trendDirection?: 'up' | 'down' | 'sideways';
  priceVsMA?: 'above' | 'below' | 'at';
  contributions?: {
    rsiScore: number;
    macdScore: number;
    ma20Score: number;
    ma50Score: number;
    rangeScore: number;
    totalScore: number;
  };
}

interface AIVisionData {
  symbol: string;
  timestamp: string;
  price: {
    current: number;
    change24h: number;
  };
  ohlcData: {
    oneMin: OHLCCandle[];
    fiveMin: OHLCCandle[];
    fifteenMin: OHLCCandle[];
    thirtyMin: OHLCCandle[];
    oneHour: OHLCCandle[];
    fourHour: OHLCCandle[];
    daily: OHLCCandle[];
  };
  indicators: {
    rsi: number | null;
    sma20: number | null;
    sma50: number | null;
    ema5: number | null;
    ema12: number | null;
    ema20: number | null;
    ema26: number | null;
    microTrend: 'bullish' | 'bearish' | 'neutral' | null;
    microTrendStrength: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    bollingerUpper: number | null;
    bollingerMiddle: number | null;
    bollingerLower: number | null;
    atr: number | null;
    trend: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    support: number | null;
    resistance: number | null;
  } | null;
  orderBook: {
    bidWallPrice: number | null;
    bidWallVolume: number | null;
    askWallPrice: number | null;
    askWallVolume: number | null;
    buyPressure: number;
    sellPressure: number;
    imbalanceRatio: number;
    spreadPercent: number;
    signal: string;
  } | null;
  fearGreed: {
    value: number;
    classification: string;
    timestamp: string;
  } | null;
  confluence: {
    overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
    confluenceScore: number;
    alignment: number;
    shouldTrade: boolean;
    recommendation: string;
    timeframes: TimeframeSignal[];
  };
  btcContext: {
    price: number;
    change24h: number;
    trend: string;
    momentum: string;
    isBTCDumping: boolean;
  } | null;
  ethContext: {
    price: number;
    change24h: number;
    trend: string;
    momentum: string;
  } | null;
  volumeAnomaly: {
    isAnomaly: boolean;
    volumeRatio: number;
    signal: string;
  } | null;
  rsiDivergence: {
    hasDivergence: boolean;
    type: string;
    strength: string;
  } | null;
  winRateStats: {
    winRate: number;
    avgProfitOnWins: number;
    avgLossOnLosses: number;
    totalTrades: number;
    consecutiveLosses: number;
    winningTrades: number;
    losingTrades: number;
  } | null;
  volatilityContext: {
    volatility15m: number;
    volatility1h: number;
    volatilityLevel: string;
    isVolatilitySpike: boolean;
    description: string;
  } | null;
  spreadAnalysis: {
    spreadPercent: number;
    isWideSpread: boolean;
    bidDepthUSD: number;
    askDepthUSD: number;
    depthRatio: number;
    hasBidWalls: boolean;
    hasAskWalls: boolean;
    signal: string;
  } | null;
  priceHistory: {
    extended: number[];
    recent1min: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>;
  };
}

function GaugeChart({ value, max = 100, label, colorZones }: { 
  value: number; 
  max?: number; 
  label: string;
  colorZones?: { start: number; end: number; color: string }[];
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const getColor = () => {
    if (!colorZones) {
      if (value <= 25) return "bg-red-500";
      if (value <= 45) return "bg-orange-500";
      if (value <= 55) return "bg-yellow-500";
      if (value <= 75) return "bg-green-400";
      return "bg-green-500";
    }
    for (const zone of colorZones) {
      if (value >= zone.start && value <= zone.end) {
        return zone.color;
      }
    }
    return "bg-muted";
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function RSIGauge({ value }: { value: number | null }) {
  if (value === null) return <div className="text-muted-foreground text-sm">No data</div>;
  
  const getZone = () => {
    if (value >= 70) return { label: "Overbought", color: "text-red-500", bg: "bg-red-500/20" };
    if (value >= 60) return { label: "High", color: "text-orange-400", bg: "bg-orange-400/20" };
    if (value <= 30) return { label: "Oversold", color: "text-green-500", bg: "bg-green-500/20" };
    if (value <= 40) return { label: "Low", color: "text-green-400", bg: "bg-green-400/20" };
    return { label: "Neutral", color: "text-yellow-400", bg: "bg-yellow-400/20" };
  };
  
  const zone = getZone();
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">RSI</span>
        <Badge variant="outline" className={`${zone.bg} ${zone.color} border-0`}>
          {zone.label}
        </Badge>
      </div>
      <div className="relative h-4 bg-gradient-to-r from-green-500 via-yellow-400 to-red-500 rounded-full">
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-3 h-6 bg-white border-2 border-gray-900 rounded-full shadow-lg transition-all duration-300"
          style={{ left: `calc(${Math.min(100, Math.max(0, value))}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>30</span>
        <span>50</span>
        <span>70</span>
        <span>100</span>
      </div>
      <div className="text-center text-2xl font-bold">{value.toFixed(1)}</div>
    </div>
  );
}

function FearGreedGauge({ value, classification }: { value: number; classification: string }) {
  const getColor = () => {
    if (value <= 20) return "from-red-600 to-red-500";
    if (value <= 40) return "from-orange-500 to-orange-400";
    if (value <= 60) return "from-yellow-500 to-yellow-400";
    if (value <= 80) return "from-green-400 to-green-500";
    return "from-green-500 to-emerald-500";
  };
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Fear & Greed Index</span>
        <Badge variant="outline" className="capitalize">{classification.replace(/_/g, ' ')}</Badge>
      </div>
      <div className="relative h-5 bg-gradient-to-r from-red-500 via-orange-400 via-yellow-400 via-green-400 to-green-600 rounded-full">
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-4 h-7 bg-white border-2 border-gray-900 rounded-full shadow-lg transition-all duration-300"
          style={{ left: `calc(${value}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Extreme Fear</span>
        <span>Fear</span>
        <span>Neutral</span>
        <span>Greed</span>
        <span>Extreme Greed</span>
      </div>
      <div className={`text-center text-3xl font-bold bg-gradient-to-r ${getColor()} bg-clip-text text-transparent`}>
        {value}
      </div>
    </div>
  );
}

function SignalIcon({ signal }: { signal: 'bullish' | 'bearish' | 'neutral' | string }) {
  if (signal === 'bullish' || signal === 'up') {
    return <TrendingUp className="w-4 h-4 text-green-500" />;
  }
  if (signal === 'bearish' || signal === 'down') {
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  }
  return <Minus className="w-4 h-4 text-yellow-400" />;
}

function PriceChart({ data, height = 300, timeframe = '5m' }: { data: OHLCCandle[]; height?: number; timeframe?: string }) {
  const getTimeframeSeconds = (tf: string): number => {
    switch (tf) {
      case '1m': return 60;
      case '5m': return 300;
      case '15m': return 900;
      case '30m': return 1800;
      case '1h': return 3600;
      case '4h': return 14400;
      case '1d': return 86400;
      default: return 300;
    }
  };
  const candleIntervalSeconds = getTimeframeSeconds(timeframe);
  const [hoveredCandle, setHoveredCandle] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No chart data available
      </div>
    );
  }

  const chartData = data.slice(-60);
  const minPrice = Math.min(...chartData.map(d => d.low)) * 0.9985;
  const maxPrice = Math.max(...chartData.map(d => d.high)) * 1.0015;
  const priceRange = maxPrice - minPrice;

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toFixed(2)}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  };

  const chartAreaPercent = 0.58;
  const ticks = Array.from({ length: 5 }, (_, i) => minPrice + (priceRange * i) / 4);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const chartAreaWidth = rect.width * chartAreaPercent;
    
    if (x >= 0 && x <= chartAreaWidth) {
      const candleIndex = Math.floor((x / chartAreaWidth) * chartData.length);
      if (candleIndex >= 0 && candleIndex < chartData.length) {
        setHoveredCandle(candleIndex);
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    } else {
      setHoveredCandle(null);
      setMousePos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredCandle(null);
    setMousePos(null);
  };

  const hovered = hoveredCandle !== null ? chartData[hoveredCandle] : null;

  const viewBoxHeight = height;
  const chartHeight = viewBoxHeight - 40;
  const chartWidth = 100;
  const yAxisWidth = 70;
  const candleWidth = (chartWidth - 5) / chartData.length;
  const bodyWidth = Math.max(candleWidth * 0.7, 0.8);

  const priceToY = (price: number) => {
    return ((maxPrice - price) / priceRange) * chartHeight + 10;
  };

  return (
    <div 
      ref={containerRef}
      className="relative cursor-crosshair" 
      style={{ height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      data-testid="price-chart"
    >
      <svg 
        width="100%" 
        height={height} 
        viewBox={`0 0 ${chartWidth + yAxisWidth} ${viewBoxHeight}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={0}
              y1={priceToY(tick)}
              x2={chartWidth}
              y2={priceToY(tick)}
              stroke="#333"
              strokeWidth={0.2}
              strokeDasharray="2,2"
            />
            <text
              x={chartWidth + 2}
              y={priceToY(tick)}
              fill="#888"
              fontSize={2.5}
              dominantBaseline="middle"
            >
              {formatPrice(tick)}
            </text>
          </g>
        ))}
        
        {chartData.map((candle, idx) => {
          const x = (idx + 0.5) * candleWidth + 2;
          const isGreen = candle.close >= candle.open;
          const color = isGreen ? '#22c55e' : '#ef4444';
          const isHovered = idx === hoveredCandle;
          
          const highY = priceToY(candle.high);
          const lowY = priceToY(candle.low);
          const openY = priceToY(candle.open);
          const closeY = priceToY(candle.close);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 0.5);

          return (
            <g key={idx}>
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={color}
                strokeWidth={isHovered ? 0.5 : 0.3}
              />
              <rect
                x={x - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyHeight}
                fill={color}
                stroke={isHovered ? '#fff' : color}
                strokeWidth={isHovered ? 0.15 : 0}
              />
            </g>
          );
        })}
        
        <line x1={0} y1={height - 30} x2={chartWidth} y2={height - 30} stroke="#333" strokeWidth={0.3} />
        <line x1={chartWidth} y1={10} x2={chartWidth} y2={height - 30} stroke="#333" strokeWidth={0.3} />
      </svg>
      
      {hovered && mousePos && (
        <div 
          className="absolute bg-card border border-border rounded-lg p-3 shadow-xl z-50 pointer-events-none"
          style={{
            left: mousePos.x > 200 ? mousePos.x - 180 : mousePos.x + 10,
            top: Math.max(10, Math.min(mousePos.y - 50, height - 150))
          }}
          data-testid="chart-tooltip"
        >
          <div className="text-xs text-muted-foreground mb-2">
            {new Date(hovered.timestamp).toLocaleString()}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm whitespace-nowrap">
            <span className="text-muted-foreground">Open:</span>
            <span>{formatPrice(hovered.open)}</span>
            <span className="text-muted-foreground">High:</span>
            <span className="text-green-400">{formatPrice(hovered.high)}</span>
            <span className="text-muted-foreground">Low:</span>
            <span className="text-red-400">{formatPrice(hovered.low)}</span>
            <span className="text-muted-foreground">Close:</span>
            <span className={hovered.close >= hovered.open ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
              {formatPrice(hovered.close)}
            </span>
          </div>
        </div>
      )}
      
    </div>
  );
}

function PressureBar({ buyPressure, sellPressure }: { buyPressure: number; sellPressure: number }) {
  const total = buyPressure + sellPressure;
  const buyPercent = total > 0 ? (buyPressure / total) * 100 : 50;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-green-500">Buy: {buyPercent.toFixed(1)}%</span>
        <span className="text-red-500">Sell: {(100 - buyPercent).toFixed(1)}%</span>
      </div>
      <div className="h-4 flex rounded-full overflow-hidden">
        <div 
          className="bg-green-500 transition-all duration-500"
          style={{ width: `${buyPercent}%` }}
        />
        <div 
          className="bg-red-500 transition-all duration-500"
          style={{ width: `${100 - buyPercent}%` }}
        />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

export default function AIVisionPage() {
  const [selectedCoin, setSelectedCoin] = useState<string>('KAS');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('5m');

  const { data: enabledCoins } = useQuery<EnabledCoin[]>({
    queryKey: ['/api/coins/enabled'],
    refetchInterval: 30000,
  });

  const { data: visionData, isLoading, error } = useQuery<AIVisionData>({
    queryKey: ['/api/ai-vision', selectedCoin],
    queryFn: async () => {
      const response = await fetch(`/api/ai-vision/${selectedCoin}`);
      if (!response.ok) throw new Error('Failed to fetch AI vision data');
      return response.json();
    },
    refetchInterval: 30000,
    enabled: !!selectedCoin,
  });

  const getOHLCData = () => {
    if (!visionData?.ohlcData) return [];
    switch (selectedTimeframe) {
      case '1m': return visionData.ohlcData.oneMin;
      case '5m': return visionData.ohlcData.fiveMin;
      case '15m': return visionData.ohlcData.fifteenMin;
      case '30m': return visionData.ohlcData.thirtyMin;
      case '1h': return visionData.ohlcData.oneHour;
      case '4h': return visionData.ohlcData.fourHour;
      case '1d': return visionData.ohlcData.daily;
      default: return visionData.ohlcData.fiveMin;
    }
  };

  const getSignalColor = (signal: string) => {
    if (signal.includes('buy') || signal === 'bullish') return 'text-green-500';
    if (signal.includes('sell') || signal === 'bearish') return 'text-red-500';
    return 'text-yellow-400';
  };

  const getTrendBadge = (trend: string | undefined) => {
    if (!trend) return null;
    const colors: Record<string, string> = {
      bullish: 'bg-green-500/20 text-green-500 border-green-500/30',
      bearish: 'bg-red-500/20 text-red-500 border-red-500/30',
      neutral: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };
    return (
      <Badge variant="outline" className={colors[trend] || colors.neutral}>
        {trend === 'bullish' && <TrendingUp className="w-3 h-3 mr-1" />}
        {trend === 'bearish' && <TrendingDown className="w-3 h-3 mr-1" />}
        {trend === 'neutral' && <Minus className="w-3 h-3 mr-1" />}
        {trend.charAt(0).toUpperCase() + trend.slice(1)}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold font-display tracking-tight flex items-center gap-3">
                <Eye className="w-8 h-8 text-primary" />
                AI Vision
              </h1>
              <p className="text-muted-foreground mt-1">
                See what the AI sees when analyzing markets
              </p>
            </div>
          </div>

          <Select value={selectedCoin} onValueChange={setSelectedCoin}>
            <SelectTrigger className="w-[180px]" data-testid="select-coin">
              <SelectValue placeholder="Select coin" />
            </SelectTrigger>
            <SelectContent>
              {enabledCoins?.map((coin) => (
                <SelectItem key={coin.symbol} value={coin.symbol}>
                  {coin.symbol}
                </SelectItem>
              )) || (
                <SelectItem value="KAS">KAS</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <Card className="p-8">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-destructive" />
              <h3 className="text-lg font-semibold">Failed to load AI Vision data</h3>
              <p className="text-muted-foreground">Please try again or select a different coin</p>
            </div>
          </Card>
        ) : visionData ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant="outline" className="text-lg px-4 py-2">
                {visionData.symbol} ${visionData.price.current.toFixed(6)}
              </Badge>
              <Badge 
                variant="outline" 
                className={visionData.price.change24h >= 0 ? 'text-green-500' : 'text-red-500'}
              >
                {visionData.price.change24h >= 0 ? '+' : ''}{visionData.price.change24h.toFixed(2)}%
              </Badge>
              {visionData.indicators && getTrendBadge(visionData.indicators.trend)}
              <span className="text-xs text-muted-foreground ml-auto">
                Updated: {new Date(visionData.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CandlestickIcon className="w-5 h-5" />
                    Price Chart
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                    <TabsList className="mb-4">
                      <TabsTrigger value="1m" data-testid="tab-1m">1m</TabsTrigger>
                      <TabsTrigger value="5m" data-testid="tab-5m">5m</TabsTrigger>
                      <TabsTrigger value="15m" data-testid="tab-15m">15m</TabsTrigger>
                      <TabsTrigger value="30m" data-testid="tab-30m">30m</TabsTrigger>
                      <TabsTrigger value="1h" data-testid="tab-1h">1H</TabsTrigger>
                      <TabsTrigger value="4h" data-testid="tab-4h">4H</TabsTrigger>
                      <TabsTrigger value="1d" data-testid="tab-1d">1D</TabsTrigger>
                    </TabsList>
                    <TabsContent value={selectedTimeframe}>
                      <PriceChart data={getOHLCData()} timeframe={selectedTimeframe} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5" />
                    Technical Indicators
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {visionData.indicators ? (
                    <>
                      <RSIGauge value={visionData.indicators.rsi} />
                      
                      {visionData.indicators.microTrend && (
                        <div className="pt-4 border-t border-border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                              <Zap className="w-4 h-4" />
                              Micro-Trend (5/20 EMA)
                            </span>
                            <Badge 
                              variant="outline" 
                              className={
                                visionData.indicators.microTrend === 'bullish' 
                                  ? 'bg-green-500/20 text-green-500 border-green-500/30' 
                                  : visionData.indicators.microTrend === 'bearish'
                                  ? 'bg-red-500/20 text-red-500 border-red-500/30'
                                  : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                              }
                              data-testid="badge-micro-trend"
                            >
                              {visionData.indicators.microTrend === 'bullish' && <TrendingUp className="w-3 h-3 mr-1" />}
                              {visionData.indicators.microTrend === 'bearish' && <TrendingDown className="w-3 h-3 mr-1" />}
                              {visionData.indicators.microTrend === 'neutral' && <Minus className="w-3 h-3 mr-1" />}
                              {visionData.indicators.microTrend.charAt(0).toUpperCase() + visionData.indicators.microTrend.slice(1)}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">EMA5: ${visionData.indicators.ema5?.toFixed(6) || 'N/A'}</span>
                            <span className="text-muted-foreground">EMA20: ${visionData.indicators.ema20?.toFixed(6) || 'N/A'}</span>
                          </div>
                          {visionData.indicators.microTrendStrength !== null && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Crossover Strength</span>
                                <span className="font-medium">{visionData.indicators.microTrendStrength.toFixed(3)}%</span>
                              </div>
                              <Progress 
                                value={Math.min(100, visionData.indicators.microTrendStrength * 20)} 
                                className={`h-2 ${visionData.indicators.microTrend === 'bullish' ? '[&>div]:bg-green-500' : '[&>div]:bg-red-500'}`}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div>
                          <span className="text-xs text-muted-foreground">MACD</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${(visionData.indicators.macd || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {visionData.indicators.macd?.toFixed(6) || 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground">Signal</span>
                          <div className="font-semibold">
                            {visionData.indicators.macdSignal?.toFixed(6) || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">SMA20</span>
                            <span className="text-sm font-medium">${visionData.indicators.sma20?.toFixed(6) || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">SMA50</span>
                            <span className="text-sm font-medium">${visionData.indicators.sma50?.toFixed(6) || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">EMA12</span>
                            <span className="text-sm font-medium">${visionData.indicators.ema12?.toFixed(6) || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-muted-foreground">EMA26</span>
                            <span className="text-sm font-medium">${visionData.indicators.ema26?.toFixed(6) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Trend</span>
                          {getTrendBadge(visionData.indicators.trend)}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-muted-foreground">Strength</span>
                          <Badge variant="outline" className="capitalize">
                            {visionData.indicators.strength}
                          </Badge>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No indicator data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="w-5 h-5" />
                    Order Book
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visionData.orderBook ? (
                    <>
                      <PressureBar 
                        buyPressure={visionData.orderBook.buyPressure} 
                        sellPressure={visionData.orderBook.sellPressure} 
                      />

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                        <div className="space-y-2">
                          <span className="text-xs text-muted-foreground block">Bid Wall</span>
                          {visionData.orderBook.bidWallPrice ? (
                            <>
                              <div className="text-sm font-medium text-green-500">
                                ${visionData.orderBook.bidWallPrice.toFixed(6)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Vol: {visionData.orderBook.bidWallVolume?.toFixed(0)}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">None detected</div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <span className="text-xs text-muted-foreground block">Ask Wall</span>
                          {visionData.orderBook.askWallPrice ? (
                            <>
                              <div className="text-sm font-medium text-red-500">
                                ${visionData.orderBook.askWallPrice.toFixed(6)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Vol: {visionData.orderBook.askWallVolume?.toFixed(0)}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">None detected</div>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Imbalance Ratio</span>
                          <span className={`font-semibold ${visionData.orderBook.imbalanceRatio > 1 ? 'text-green-500' : visionData.orderBook.imbalanceRatio < 1 ? 'text-red-500' : 'text-yellow-400'}`}>
                            {visionData.orderBook.imbalanceRatio.toFixed(2)}x
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Spread</span>
                          <span className="font-medium">{visionData.orderBook.spreadPercent.toFixed(3)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Signal</span>
                          <Badge variant="outline" className={getSignalColor(visionData.orderBook.signal)}>
                            {visionData.orderBook.signal}
                          </Badge>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No order book data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Gauge className="w-5 h-5" />
                    Sentiment & Confluence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visionData.fearGreed && (
                    <FearGreedGauge 
                      value={visionData.fearGreed.value} 
                      classification={visionData.fearGreed.classification} 
                    />
                  )}

                  <div className="pt-4 border-t border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Confluence Score</span>
                      <span className="text-xl font-bold">{visionData.confluence.confluenceScore}</span>
                    </div>
                    <Progress value={visionData.confluence.confluenceScore} className="h-2" />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Overall Signal</span>
                      <Badge 
                        variant="outline" 
                        className={getSignalColor(visionData.confluence.overallSignal)}
                      >
                        {visionData.confluence.overallSignal.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {visionData.confluence.timeframes.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <span className="text-xs text-muted-foreground block mb-3">Timeframe Signals</span>
                      <div className="space-y-2">
                        {visionData.confluence.timeframes.map((tf) => (
                          <div key={tf.timeframe} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{tf.timeframe}</span>
                              <div className="flex items-center gap-2">
                                <SignalIcon signal={tf.signal} />
                                <span className={`text-sm ${
                                  tf.signal === 'bullish' ? 'text-green-500' : 
                                  tf.signal === 'bearish' ? 'text-red-500' : 'text-yellow-400'
                                }`}>
                                  {tf.signal}
                                </span>
                                {tf.contributions && (
                                  <span className="text-xs text-muted-foreground">
                                    ({tf.contributions.totalScore > 0 ? '+' : ''}{tf.contributions.totalScore.toFixed(1)})
                                  </span>
                                )}
                              </div>
                            </div>
                            {tf.contributions && (
                              <div className="flex flex-wrap gap-1 text-xs">
                                <span className={`px-1.5 py-0.5 rounded ${tf.contributions.rsiScore > 0 ? 'bg-green-500/20 text-green-400' : tf.contributions.rsiScore < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                  RSI:{tf.contributions.rsiScore > 0 ? '+' : ''}{tf.contributions.rsiScore}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded ${tf.contributions.macdScore > 0 ? 'bg-green-500/20 text-green-400' : tf.contributions.macdScore < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                  MACD:{tf.contributions.macdScore > 0 ? '+' : ''}{tf.contributions.macdScore}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded ${tf.contributions.ma20Score > 0 ? 'bg-green-500/20 text-green-400' : tf.contributions.ma20Score < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                  MA20:{tf.contributions.ma20Score > 0 ? '+' : ''}{tf.contributions.ma20Score}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded ${tf.contributions.ma50Score > 0 ? 'bg-green-500/20 text-green-400' : tf.contributions.ma50Score < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                  MA50:{tf.contributions.ma50Score > 0 ? '+' : ''}{tf.contributions.ma50Score}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded ${tf.contributions.rangeScore > 0 ? 'bg-green-500/20 text-green-400' : tf.contributions.rangeScore < 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                  Range:{tf.contributions.rangeScore > 0 ? '+' : ''}{tf.contributions.rangeScore}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-2">
                      {visionData.confluence.shouldTrade ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-sm">
                        {visionData.confluence.shouldTrade ? 'Trade conditions met' : 'Waiting for better conditions'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="w-5 h-5" />
                    Market Context
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {visionData.btcContext && (
                    <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">BTC Context</span>
                        {visionData.btcContext.isBTCDumping && (
                          <Badge variant="destructive" className="text-xs">Dumping</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Price:</span>
                        <span>${visionData.btcContext.price.toLocaleString()}</span>
                        <span className="text-muted-foreground">24h:</span>
                        <span className={visionData.btcContext.change24h >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {visionData.btcContext.change24h.toFixed(2)}%
                        </span>
                        <span className="text-muted-foreground">Trend:</span>
                        <span>{visionData.btcContext.trend}</span>
                      </div>
                    </div>
                  )}

                  {visionData.ethContext && (
                    <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">ETH Context</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Price:</span>
                        <span>${visionData.ethContext.price.toLocaleString()}</span>
                        <span className="text-muted-foreground">24h:</span>
                        <span className={visionData.ethContext.change24h >= 0 ? 'text-green-500' : 'text-red-500'}>
                          {visionData.ethContext.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-border space-y-3">
                    {visionData.volumeAnomaly && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          Volume Anomaly
                        </span>
                        {visionData.volumeAnomaly.isAnomaly ? (
                          <Badge variant="outline" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                            {visionData.volumeAnomaly.volumeRatio.toFixed(1)}x normal
                          </Badge>
                        ) : (
                          <Badge variant="outline">Normal</Badge>
                        )}
                      </div>
                    )}

                    {visionData.rsiDivergence && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <LineChart className="w-4 h-4" />
                          RSI Divergence
                        </span>
                        {visionData.rsiDivergence.hasDivergence ? (
                          <Badge 
                            variant="outline" 
                            className={visionData.rsiDivergence.type === 'bullish' ? 'text-green-500' : 'text-red-500'}
                          >
                            {visionData.rsiDivergence.type} ({visionData.rsiDivergence.strength})
                          </Badge>
                        ) : (
                          <Badge variant="outline">None</Badge>
                        )}
                      </div>
                    )}

                    {visionData.volatilityContext && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Thermometer className="w-4 h-4" />
                          Volatility
                        </span>
                        <Badge 
                          variant="outline"
                          className={
                            visionData.volatilityContext.volatilityLevel === 'high' ? 'text-red-500' :
                            visionData.volatilityContext.volatilityLevel === 'low' ? 'text-green-500' : ''
                          }
                        >
                          {visionData.volatilityContext.volatilityLevel}
                          {visionData.volatilityContext.isVolatilitySpike && ' (spike!)'}
                        </Badge>
                      </div>
                    )}

                    {visionData.spreadAnalysis && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <BarChart3 className="w-4 h-4" />
                          Spread Analysis
                        </span>
                        <Badge 
                          variant="outline"
                          className={
                            visionData.spreadAnalysis.signal === 'strong_buy_pressure' ? 'text-green-500' :
                            visionData.spreadAnalysis.signal === 'strong_sell_pressure' ? 'text-red-500' :
                            visionData.spreadAnalysis.signal === 'thin_liquidity' ? 'text-yellow-500' : ''
                          }
                        >
                          {visionData.spreadAnalysis.spreadPercent.toFixed(3)}% ({visionData.spreadAnalysis.signal.replace(/_/g, ' ')})
                        </Badge>
                      </div>
                    )}
                  </div>

                  {visionData.winRateStats && visionData.winRateStats.totalTrades > 0 && (
                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Win Rate Stats</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Win Rate:</span>
                        <span className={visionData.winRateStats.winRate >= 50 ? 'text-green-500' : 'text-red-500'}>
                          {visionData.winRateStats.winRate.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">Total Trades:</span>
                        <span>{visionData.winRateStats.totalTrades}</span>
                        <span className="text-muted-foreground">W/L:</span>
                        <span>
                          <span className="text-green-500">{visionData.winRateStats.winningTrades}</span>
                          /
                          <span className="text-red-500">{visionData.winRateStats.losingTrades}</span>
                        </span>
                        <span className="text-muted-foreground">Avg Win:</span>
                        <span className="text-green-500">+{visionData.winRateStats.avgProfitOnWins.toFixed(2)}%</span>
                        <span className="text-muted-foreground">Avg Loss:</span>
                        <span className="text-red-500">{visionData.winRateStats.avgLossOnLosses.toFixed(2)}%</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {visionData.confluence.recommendation && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <span className="text-sm font-medium">AI Recommendation</span>
                      <p className="text-muted-foreground mt-1">{visionData.confluence.recommendation}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
