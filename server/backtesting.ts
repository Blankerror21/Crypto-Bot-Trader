/**
 * Backtesting Engine
 * Simulates trading strategies against historical price data
 */

import { fetchHistoricalOHLC, type OHLCData } from './kraken';
import { storage } from './storage';
import type { InsertBacktestResult, BotSettings } from '@shared/schema';
import OpenAI from 'openai';

// ============== PROGRESS TRACKING ==============
// Store progress by userId for real-time progress updates
interface BacktestProgress {
  percent: number;
  message: string;
  phase: 'fetching' | 'calculating' | 'simulating' | 'finalizing' | 'complete' | 'error';
  currentCandle: number;
  totalCandles: number;
  aiCalls: number;
  startTime: number;
}

const progressStore: Map<string, BacktestProgress> = new Map();

export function getBacktestProgress(userId: string): BacktestProgress | null {
  return progressStore.get(userId) || null;
}

function updateProgress(userId: string, progress: Partial<BacktestProgress>) {
  const current = progressStore.get(userId) || {
    percent: 0,
    message: 'Initializing...',
    phase: 'fetching' as const,
    currentCandle: 0,
    totalCandles: 0,
    aiCalls: 0,
    startTime: Date.now()
  };
  progressStore.set(userId, { ...current, ...progress });
}

function clearProgress(userId: string) {
  // Keep progress for 5 seconds after completion so frontend can see 100%
  setTimeout(() => progressStore.delete(userId), 5000);
}

// Default OpenAI client - will be overridden when custom endpoint is used
const defaultOpenai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Get OpenAI client with custom endpoint support (matches autoPilot.ts pattern)
function getOpenAIClientWithConfig(endpoint: string | null): OpenAI {
  if (endpoint) {
    // Normalize endpoint - ensure it ends with /v1
    let normalizedEndpoint = endpoint.trim();
    if (normalizedEndpoint.endsWith('/')) {
      normalizedEndpoint = normalizedEndpoint.slice(0, -1);
    }
    if (!normalizedEndpoint.endsWith('/v1')) {
      normalizedEndpoint = normalizedEndpoint + '/v1';
    }
    
    console.log(`[AI-BACKTEST] Connecting to custom endpoint: ${normalizedEndpoint}`);
    return new OpenAI({
      baseURL: normalizedEndpoint,
      apiKey: "lm-studio", // Local LLMs don't need a real API key
    });
  }
  console.log(`[AI-BACKTEST] Using default OpenAI API`);
  return defaultOpenai;
}

// Simulated trade during backtest
export interface BacktestTrade {
  timestamp: number;
  type: 'buy' | 'sell';
  price: number;
  amount: number;
  value: number;
  reason: string;
  profitLoss?: number;
  profitLossPercent?: number;
}

// Configuration for a backtest run
export interface BacktestConfig {
  symbol: string;
  strategy: 'momentum' | 'mean_reversion' | 'scalping' | 'combined' | 'ai' | 'ai_scalper' | 'signal_only';
  startDate: Date;
  endDate: Date;
  startingBalance: number;
  // Strategy parameters
  stopLossPercent: number;
  takeProfitPercent: number;
  tradeAmount: number; // USD per trade
  // Momentum settings
  momentumPeriod?: number;
  momentumThreshold?: number;
  // Mean reversion settings
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  // Scalping settings
  scalpingTargetPercent?: number;
  scalpingStopPercent?: number;
  emaFast?: number;
  emaSlow?: number;
  // AI settings
  aiConfidenceThreshold?: number; // Minimum confidence to act (default 65)
  // AI Scalper Pro settings
  aiScalperTrailingPercent?: number; // Trailing stop-loss percent (default 0.2%)
  aiScalperTimeoutMinutes?: number; // Max hold time in minutes (default 15)
  aiScalperMinSpread?: number; // Minimum spread filter (default 0.1%)
  aiScalperVolumeMultiplier?: number; // Volume filter multiplier (default 1.5)
  aiScalperEmaFast?: number; // Fast EMA period (default 9)
  aiScalperEmaSlow?: number; // Slow EMA period (default 21)
  aiScalperRsiOversold?: number; // RSI oversold threshold (default 30)
  aiScalperAntiChopAtr?: number; // Anti-chop ATR filter (default 0.15%)
}

// Backtest result with all metrics
export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  startingBalance: number;
  endingBalance: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingTimeMinutes: number;
  trades: BacktestTrade[];
  equityCurve: { timestamp: number; equity: number }[];
}

// Calculate RSI from price data
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const gains = changes.slice(-period).filter(c => c > 0);
  const losses = changes.slice(-period).filter(c => c < 0).map(c => Math.abs(c));
  
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate momentum (rate of change)
function calculateMomentum(prices: number[], period: number = 10): number {
  if (prices.length < period + 1) return 0;
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - period];
  return ((current - past) / past) * 100;
}

// Calculate MACD
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;
  const signalLine = calculateEMA([...prices.slice(-9).map(() => macd)], 9);
  return { macd, signal: signalLine, histogram: macd - signalLine };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 20): { upper: number; middle: number; lower: number; percentB: number } {
  if (prices.length < period) {
    return { upper: 0, middle: 0, lower: 0, percentB: 50 };
  }
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + (stdDev * 2);
  const lower = middle - (stdDev * 2);
  const currentPrice = prices[prices.length - 1];
  const percentB = ((currentPrice - lower) / (upper - lower)) * 100;
  return { upper, middle, lower, percentB };
}

// Calculate VWAP (Volume Weighted Average Price)
function calculateVWAP(candles: OHLCData[]): number {
  if (candles.length === 0) return 0;
  
  let cumulativePV = 0; // Cumulative (Price * Volume)
  let cumulativeVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : candles[candles.length - 1].close;
}

// ============== MULTI-TIMEFRAME ANALYSIS ==============

// Aggregate lower timeframe candles into higher timeframe
function aggregateCandles(candles: OHLCData[], multiplier: number): OHLCData[] {
  const aggregated: OHLCData[] = [];
  
  for (let i = 0; i < candles.length; i += multiplier) {
    const chunk = candles.slice(i, i + multiplier);
    if (chunk.length === 0) continue;
    
    aggregated.push({
      timestamp: chunk[0].timestamp,
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0)
    });
  }
  
  return aggregated;
}

// Analyze higher timeframe trend direction
interface TrendAnalysis {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  ema20: number;
  ema50: number;
  rsi: number;
  momentum: number;
  description: string;
}

function analyzeHigherTimeframeTrend(candles: OHLCData[]): TrendAnalysis {
  if (candles.length < 50) {
    return { direction: 'neutral', strength: 0, ema20: 0, ema50: 0, rsi: 50, momentum: 0, description: 'Insufficient data' };
  }
  
  const prices = candles.map(c => c.close);
  const currentPrice = prices[prices.length - 1];
  
  // Calculate higher timeframe indicators
  const ema20 = calculateEMA(prices, 20);
  const ema50 = calculateEMA(prices, 50);
  const rsi = calculateRSI(prices, 14);
  const momentum = calculateMomentum(prices, 10);
  const macd = calculateMACD(prices);
  
  // Score the trend direction
  let bullPoints = 0;
  let bearPoints = 0;
  
  // EMA alignment (strongest signal)
  if (currentPrice > ema20 && ema20 > ema50) bullPoints += 3;
  else if (currentPrice < ema20 && ema20 < ema50) bearPoints += 3;
  else if (currentPrice > ema50) bullPoints += 1;
  else if (currentPrice < ema50) bearPoints += 1;
  
  // RSI trend
  if (rsi > 55) bullPoints += 1.5;
  else if (rsi < 45) bearPoints += 1.5;
  
  // Momentum
  if (momentum > 2) bullPoints += 2;
  else if (momentum > 0.5) bullPoints += 1;
  else if (momentum < -2) bearPoints += 2;
  else if (momentum < -0.5) bearPoints += 1;
  
  // MACD
  if (macd.histogram > 0 && macd.macd > macd.signal) bullPoints += 1.5;
  else if (macd.histogram < 0 && macd.macd < macd.signal) bearPoints += 1.5;
  
  // Price position relative to EMAs
  const priceVsEma20 = ((currentPrice - ema20) / ema20) * 100;
  const priceVsEma50 = ((currentPrice - ema50) / ema50) * 100;
  
  // Determine direction and strength
  const totalPoints = bullPoints + bearPoints;
  const netScore = bullPoints - bearPoints;
  
  let direction: 'bullish' | 'bearish' | 'neutral';
  let strength: number;
  let description: string;
  
  if (netScore >= 4) {
    direction = 'bullish';
    strength = Math.min(100, 60 + netScore * 5);
    description = `STRONG UPTREND: Price ${priceVsEma20.toFixed(1)}% above EMA20, RSI ${rsi.toFixed(0)}, Mom ${momentum.toFixed(1)}%`;
  } else if (netScore >= 2) {
    direction = 'bullish';
    strength = 50 + netScore * 5;
    description = `Uptrend: Price above key EMAs, positive momentum`;
  } else if (netScore <= -4) {
    direction = 'bearish';
    strength = Math.min(100, 60 + Math.abs(netScore) * 5);
    description = `STRONG DOWNTREND: Price ${Math.abs(priceVsEma20).toFixed(1)}% below EMA20, RSI ${rsi.toFixed(0)}, Mom ${momentum.toFixed(1)}%`;
  } else if (netScore <= -2) {
    direction = 'bearish';
    strength = 50 + Math.abs(netScore) * 5;
    description = `Downtrend: Price below key EMAs, negative momentum`;
  } else {
    direction = 'neutral';
    strength = 30;
    description = `RANGING/CHOPPY: No clear trend, RSI ${rsi.toFixed(0)}, mixed signals`;
  }
  
  return { direction, strength, ema20, ema50, rsi, momentum, description };
}

// Multi-timeframe analysis result
interface MultiTimeframeAnalysis {
  htf1h: TrendAnalysis;  // 1-hour timeframe (12 x 5min candles)
  htf4h: TrendAnalysis;  // 4-hour timeframe (48 x 5min candles)
  alignment: 'aligned_bull' | 'aligned_bear' | 'conflicting' | 'neutral';
  canTrade: boolean;
  tradeDirection: 'long' | 'short' | 'none';
  description: string;
}

function analyzeMultipleTimeframes(candles: OHLCData[], currentIndex: number): MultiTimeframeAnalysis {
  // Get candles up to current index
  const availableCandles = candles.slice(0, currentIndex + 1);
  
  // Reduced from 240 to 60 candles (5 hours of 5min data) to allow earlier trading
  // We'll use available data even if 4h analysis is limited
  if (availableCandles.length < 60) {
    return {
      htf1h: { direction: 'neutral', strength: 0, ema20: 0, ema50: 0, rsi: 50, momentum: 0, description: 'Insufficient data' },
      htf4h: { direction: 'neutral', strength: 0, ema20: 0, ema50: 0, rsi: 50, momentum: 0, description: 'Insufficient data' },
      alignment: 'neutral',
      canTrade: true, // Allow trading with lower confidence even with limited data
      tradeDirection: 'long',
      description: 'Limited HTF data - using lower timeframe signals only'
    };
  }
  
  // Aggregate to 1-hour candles (12 x 5min)
  const candles1h = aggregateCandles(availableCandles, 12);
  const htf1h = analyzeHigherTimeframeTrend(candles1h);
  
  // Aggregate to 4-hour candles (48 x 5min)
  const candles4h = aggregateCandles(availableCandles, 48);
  const htf4h = analyzeHigherTimeframeTrend(candles4h);
  
  // Determine alignment
  let alignment: 'aligned_bull' | 'aligned_bear' | 'conflicting' | 'neutral';
  let canTrade = false;
  let tradeDirection: 'long' | 'short' | 'none' = 'none';
  let description: string;
  
  if (htf1h.direction === 'bullish' && htf4h.direction === 'bullish') {
    alignment = 'aligned_bull';
    canTrade = true;
    tradeDirection = 'long';
    description = `BULLISH ALIGNMENT: 1H & 4H both trending up - LOOK FOR LONG ENTRIES`;
  } else if (htf1h.direction === 'bearish' && htf4h.direction === 'bearish') {
    alignment = 'aligned_bear';
    canTrade = true;
    tradeDirection = 'short';
    description = `BEARISH ALIGNMENT: 1H & 4H both trending down - AVOID LONGS`;
  } else if (htf1h.direction === 'neutral' && htf4h.direction === 'neutral') {
    alignment = 'neutral';
    // CHANGED: Allow trading in ranging markets for day trading/scalping
    // Use lower confidence instead of blocking entirely
    canTrade = true;
    tradeDirection = 'long';
    description = `RANGING MARKET: Both TFs neutral - trade with lower confidence, focus on quick scalps`;
  } else if ((htf1h.direction === 'bullish' && htf4h.direction === 'bearish') ||
             (htf1h.direction === 'bearish' && htf4h.direction === 'bullish')) {
    alignment = 'conflicting';
    // CHANGED: Allow trading in conflicting markets with caution
    // Day traders can still profit from short-term moves
    canTrade = true;
    tradeDirection = htf1h.direction === 'bullish' ? 'long' : 'none';
    description = `CONFLICTING: 1H=${htf1h.direction}, 4H=${htf4h.direction} - trade cautiously with lower TF signals`;
  } else {
    // One neutral, one trending - can trade with caution in trending direction
    if (htf4h.direction === 'bullish') {
      alignment = 'aligned_bull';
      canTrade = htf4h.strength >= 50;
      tradeDirection = canTrade ? 'long' : 'none';
      description = `4H BULLISH (1H neutral): Cautious longs allowed if 4H strong`;
    } else if (htf4h.direction === 'bearish') {
      alignment = 'aligned_bear';
      canTrade = false; // Don't short in backtesting (spot only)
      tradeDirection = 'none';
      description = `4H BEARISH: Avoid longs, wait for reversal`;
    } else {
      alignment = 'neutral';
      canTrade = htf1h.direction === 'bullish' && htf1h.strength >= 60;
      tradeDirection = canTrade ? 'long' : 'none';
      description = `1H ${htf1h.direction}, 4H neutral: ${canTrade ? 'Cautious trades' : 'Wait for confirmation'}`;
    }
  }
  
  return { htf1h, htf4h, alignment, canTrade, tradeDirection, description };
}

// AI-powered signal generation with GPT (supports custom endpoint)
// Uses MULTI-TIMEFRAME ANALYSIS: Higher TF for trend, lower TF for entry
async function generateAISignal(
  candles: OHLCData[],
  index: number,
  config: BacktestConfig,
  position: { amount: number; entryPrice: number } | null,
  symbol: string,
  aiClient: OpenAI,
  aiModel: string
): Promise<{ action: 'buy' | 'sell' | 'hold'; confidence: number; reasoning: string }> {
  if (index < 50) return { action: 'hold', confidence: 0, reasoning: 'Insufficient data' };
  
  // ============== MULTI-TIMEFRAME FILTER ==============
  // Analyze higher timeframes FIRST to determine if we should even look for entries
  const mtfAnalysis = analyzeMultipleTimeframes(candles, index);
  
  // If no position and higher timeframes don't support trading, skip
  if (!position && !mtfAnalysis.canTrade) {
    return { 
      action: 'hold', 
      confidence: 20, 
      reasoning: `MTF Filter: ${mtfAnalysis.description}` 
    };
  }
  
  // If higher timeframes are bearish and we have no position, don't buy
  if (!position && mtfAnalysis.alignment === 'aligned_bear') {
    return { 
      action: 'hold', 
      confidence: 15, 
      reasoning: `HTF Bearish - not entering longs: ${mtfAnalysis.htf4h.description}` 
    };
  }
  
  const recentCandles = candles.slice(Math.max(0, index - 50), index + 1);
  const prices = recentCandles.map(c => c.close);
  const currentPrice = candles[index].close;
  const currentTime = new Date(candles[index].timestamp);
  
  // Calculate all technical indicators (LOWER TIMEFRAME for entry timing)
  const rsi = calculateRSI(prices, 14);
  const momentum = calculateMomentum(prices, 10);
  const emaFast = calculateEMA(prices, 9);
  const emaSlow = calculateEMA(prices, 21);
  const ema50 = calculateEMA(prices, 50);
  const macd = calculateMACD(prices);
  const bollinger = calculateBollingerBands(prices, 20);
  
  // Calculate price changes
  const priceChange1h = prices.length >= 12 ? ((currentPrice - prices[prices.length - 12]) / prices[prices.length - 12]) * 100 : 0;
  const priceChange4h = prices.length >= 48 ? ((currentPrice - prices[prices.length - 48]) / prices[prices.length - 48]) * 100 : 0;
  
  // Calculate volume trends
  const volumes = recentCandles.map(c => c.volume);
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  
  // Position status
  const positionStatus = position && position.amount > 0 
    ? `HOLDING: Entry $${position.entryPrice.toFixed(6)}, P/L: ${(((currentPrice - position.entryPrice) / position.entryPrice) * 100).toFixed(2)}%`
    : 'NO POSITION';

  // Use MTF analysis for trend context
  const trendStrength = mtfAnalysis.alignment === 'aligned_bull' ? 'STRONG UPTREND (MTF ALIGNED)' 
    : mtfAnalysis.alignment === 'aligned_bear' ? 'STRONG DOWNTREND (MTF ALIGNED)'
    : 'MIXED/RANGING';
  
  // Calculate ATR for volatility filter
  const highs = recentCandles.slice(-14).map(c => c.high);
  const lows = recentCandles.slice(-14).map(c => c.low);
  const closes = recentCandles.slice(-14).map(c => c.close);
  let atrSum = 0;
  for (let i = 1; i < Math.min(14, highs.length); i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
    atrSum += tr;
  }
  const atr = atrSum / Math.max(1, Math.min(14, highs.length) - 1);
  const atrPercent = (atr / currentPrice) * 100;
  
  // Signal scoring for pre-analysis
  let bullScore = 0, bearScore = 0;
  if (rsi < 30) bullScore += 2;
  if (rsi > 70) bearScore += 2;
  if (emaFast > emaSlow) bullScore += 1.5;
  if (emaFast < emaSlow) bearScore += 1.5;
  if (currentPrice > ema50) bullScore += 1;
  if (currentPrice < ema50) bearScore += 1;
  if (macd.histogram > 0) bullScore += 1;
  if (macd.histogram < 0) bearScore += 1;
  if (bollinger.percentB < 20) bullScore += 1.5;
  if (bollinger.percentB > 80) bearScore += 1.5;
  if (momentum > 1) bullScore += 1;
  if (momentum < -1) bearScore += 1;
  
  // Boost bull score if MTF is aligned bullish (trade with the trend!)
  if (mtfAnalysis.alignment === 'aligned_bull') {
    bullScore += 2;
  }
  
  // Build AI prompt with MULTI-TIMEFRAME context
  const prompt = `You are a PROFESSIONAL cryptocurrency trader using MULTI-TIMEFRAME ANALYSIS.

HIGHER TIMEFRAME CONTEXT (THE TREND - MOST IMPORTANT):
- 1H Trend: ${mtfAnalysis.htf1h.direction.toUpperCase()} (RSI: ${mtfAnalysis.htf1h.rsi.toFixed(0)}, Mom: ${mtfAnalysis.htf1h.momentum.toFixed(1)}%)
- 4H Trend: ${mtfAnalysis.htf4h.direction.toUpperCase()} (RSI: ${mtfAnalysis.htf4h.rsi.toFixed(0)}, Mom: ${mtfAnalysis.htf4h.momentum.toFixed(1)}%)
- ALIGNMENT: ${mtfAnalysis.description}
${mtfAnalysis.canTrade ? '** TREND SUPPORTS TRADING - LOOK FOR ENTRIES **' : '** NO CLEAR TREND - BE CAUTIOUS **'}

LOWER TIMEFRAME ENTRY (5min - ${currentTime.toISOString()}):
- Price: $${currentPrice.toFixed(6)}
- ATR: ${atrPercent.toFixed(3)}% ${atrPercent < 0.1 ? '(LOW)' : atrPercent > 0.5 ? '(HIGH)' : ''}
- 1H Change: ${priceChange1h.toFixed(2)}% | 4H Change: ${priceChange4h.toFixed(2)}%

ENTRY SIGNALS (Lower TF): Bull=${bullScore.toFixed(1)} vs Bear=${bearScore.toFixed(1)} ${bullScore >= 5 ? '** STRONG BUY **' : bearScore >= 5 ? '** STRONG SELL **' : ''}

INDICATORS:
- RSI: ${rsi.toFixed(1)} ${rsi < 30 ? '(OVERSOLD - entry zone)' : rsi > 70 ? '(OVERBOUGHT)' : ''}
- EMA: ${emaFast > emaSlow ? 'Bullish alignment' : 'Bearish alignment'}
- Bollinger: ${bollinger.percentB.toFixed(1)}% ${bollinger.percentB < 20 ? '(Lower band - buy zone)' : bollinger.percentB > 80 ? '(Upper band)' : ''}
- Volume: ${volumeRatio.toFixed(2)}x ${volumeRatio > 1.5 ? '(Active)' : ''}

POSITION: ${positionStatus}
TARGETS: Stop ${config.stopLossPercent}%, Profit ${config.takeProfitPercent}%

RULES:
1. ONLY BUY when higher timeframes are bullish AND lower TF shows entry signal
2. Look for pullbacks in uptrends (RSI<40, Bollinger<30) as entry points
3. Exit when profit target hit OR trend reverses
4. If HTF bearish, do NOT enter longs

Respond ONLY with JSON: {"action": "buy"/"sell"/"hold", "confidence": 0-100, "reasoning": "brief"}`;

  try {
    console.log(`[AI-BACKTEST] Using model: ${aiModel}`);
    const response = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, // Deterministic for consistent backtests
      max_tokens: 200,
    });
    
    const content = response.choices[0]?.message?.content || '';
    
    // Parse JSON response - handle thinking tags from some models
    let jsonContent = content;
    if (content.includes('<think>')) {
      jsonContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }
    
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const aiAction = parsed.action?.toLowerCase() as 'buy' | 'sell' | 'hold';
      const aiConfidence = Math.min(100, Math.max(0, parsed.confidence || 50));
      
      // SIGNAL SCORING IS PRIMARY - AI only confirms or boosts confidence
      // This ensures deterministic, reproducible results
      const minScoreForEntry = 4.5;
      const minScoreForExit = 3.5;
      
      // Skip low-volatility choppy markets (ATR filter)
      if (atrPercent < 0.08 && !position) {
        return { action: 'hold', confidence: 30, reasoning: `Low volatility (ATR ${atrPercent.toFixed(3)}%) - skipping` };
      }
      
      // BUY logic: Signal score is primary, AI confirms
      if (!position && bullScore >= minScoreForEntry && bullScore > bearScore * 1.3) {
        // Strong bullish signals - use signal score as base confidence
        const baseConfidence = Math.min(85, 55 + bullScore * 5);
        // Boost if AI agrees
        const finalConfidence = aiAction === 'buy' ? Math.min(95, baseConfidence + 10) : baseConfidence;
        return { 
          action: 'buy', 
          confidence: finalConfidence, 
          reasoning: `Signal score: Bull ${bullScore.toFixed(1)} vs Bear ${bearScore.toFixed(1)}${aiAction === 'buy' ? ' (AI confirms)' : ''}` 
        };
      }
      
      // SELL logic: Exit positions when bearish or profit target
      if (position) {
        const pnl = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        
        // Take profit at 1.5%+ regardless of signals
        if (pnl >= 1.5) {
          return { action: 'sell', confidence: 85, reasoning: `Take profit: ${pnl.toFixed(2)}%` };
        }
        
        // Cut losses at -1%
        if (pnl <= -1.0) {
          return { action: 'sell', confidence: 80, reasoning: `Stop loss: ${pnl.toFixed(2)}%` };
        }
        
        // Bearish signals while holding - exit
        if (bearScore >= minScoreForExit && bearScore > bullScore * 1.2) {
          return { 
            action: 'sell', 
            confidence: Math.min(80, 55 + bearScore * 5), 
            reasoning: `Exit: Bear score ${bearScore.toFixed(1)} (P/L: ${pnl.toFixed(2)}%)` 
          };
        }
        
        // RSI overbought - take profits
        if (rsi > 70 && pnl > 0.5) {
          return { action: 'sell', confidence: 75, reasoning: `RSI overbought ${rsi.toFixed(0)}, locking ${pnl.toFixed(2)}%` };
        }
      }
      
      return { action: 'hold', confidence: aiConfidence, reasoning: parsed.reasoning || 'Waiting for stronger signal' };
    }
  } catch (error) {
    console.log(`[AI-BACKTEST] API error, using signal scoring: ${error}`);
  }
  
  // Fallback to pure signal scoring if AI fails
  const minScore = 4.5;
  
  // Skip choppy markets
  if (atrPercent < 0.08 && !position) {
    return { action: 'hold', confidence: 30, reasoning: 'Low volatility - skipping' };
  }
  
  if (!position && bullScore >= minScore && bullScore > bearScore * 1.3) {
    return { action: 'buy', confidence: Math.min(85, 55 + bullScore * 5), reasoning: `Signal buy: Bull ${bullScore.toFixed(1)}` };
  } else if (position) {
    const pnl = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    if (pnl >= 1.5) return { action: 'sell', confidence: 85, reasoning: `Take profit: ${pnl.toFixed(2)}%` };
    if (pnl <= -1.0) return { action: 'sell', confidence: 80, reasoning: `Stop loss: ${pnl.toFixed(2)}%` };
    if (bearScore >= 3.5 && bearScore > bullScore * 1.2) {
      return { action: 'sell', confidence: Math.min(80, 55 + bearScore * 5), reasoning: `Signal sell: Bear ${bearScore.toFixed(1)}` };
    }
  }
  
  return { action: 'hold', confidence: 50, reasoning: 'No strong signal' };
}

// AI Scalper Pro signal generation - aggressive short-term scalping with AI
// Uses MULTI-TIMEFRAME ANALYSIS: 1H for trend, 5min for entry
// WATCHING MODE: AI maintains context across candles, only acts when pattern completes
async function generateAIScalperSignal(
  candles: OHLCData[],
  index: number,
  config: BacktestConfig,
  position: { amount: number; entryPrice: number; highWaterMark?: number } | null,
  symbol: string,
  aiClient: OpenAI,
  aiModel: string,
  watchingState: { pattern: string | null; since: number; lastCheckScore: number; consecutiveSetups: number }
): Promise<{ action: 'buy' | 'sell' | 'hold' | 'watching'; confidence: number; reasoning: string; newWatchingState: typeof watchingState }> {
  const defaultState = { ...watchingState };
  const resetState = { pattern: null, since: 0, lastCheckScore: 0, consecutiveSetups: 0 };
  
  // Helper to wrap returns with watching state
  const makeResult = (action: 'buy' | 'sell' | 'hold' | 'watching', confidence: number, reasoning: string, state = defaultState) => 
    ({ action, confidence, reasoning, newWatchingState: state });
  
  if (index < 50) return makeResult('hold', 0, 'Insufficient data', resetState);
  
  // ============== MULTI-TIMEFRAME FILTER FOR SCALPING ==============
  const mtfAnalysis = analyzeMultipleTimeframes(candles, index);
  
  // For scalping, we're more lenient but still filter major bearish trends
  if (!position && mtfAnalysis.alignment === 'aligned_bear') {
    return makeResult('hold', 15, `MTF Bearish - skipping scalp: ${mtfAnalysis.htf1h.description}`, resetState);
  }
  
  // For scalping, we can trade in neutral conditions but prefer bullish
  const trendBonus = mtfAnalysis.alignment === 'aligned_bull' ? 1.5 : 
                     mtfAnalysis.htf1h.direction === 'bullish' ? 1.0 : 0;
  
  const recentCandles = candles.slice(Math.max(0, index - 100), index + 1);
  const prices = recentCandles.map(c => c.close);
  const currentPrice = candles[index].close;
  const currentTime = new Date(candles[index].timestamp);
  
  // Get configurable EMA periods
  const emaFastPeriod = config.aiScalperEmaFast || 9;
  const emaSlowPeriod = config.aiScalperEmaSlow || 21;
  const rsiOversold = config.aiScalperRsiOversold || 30;
  const volumeThreshold = config.aiScalperVolumeMultiplier || 1.5;
  const antiChopAtr = config.aiScalperAntiChopAtr || 0.15;
  
  // Calculate short-term scalping indicators
  const ema5 = calculateEMA(prices, 5);
  const ema20 = calculateEMA(prices, 20); // Micro-trend EMA (AI requested)
  const emaFast = calculateEMA(prices, emaFastPeriod);
  const emaSlow = calculateEMA(prices, emaSlowPeriod);
  const rsi = calculateRSI(prices, 14);
  const momentum = calculateMomentum(prices, 5);
  const bollinger = calculateBollingerBands(prices, 20);
  const macd = calculateMACD(prices);
  
  // Rate of Change (ROC) - AI requested for short-term momentum
  const roc3 = prices.length >= 4 ? ((currentPrice - prices[prices.length - 4]) / prices[prices.length - 4]) * 100 : 0;
  const roc5 = prices.length >= 6 ? ((currentPrice - prices[prices.length - 6]) / prices[prices.length - 6]) * 100 : 0;
  
  // 5/20 EMA crossover detection (AI requested micro-trend)
  const microTrendBullish = ema5 > ema20;
  const ema5CrossAbove20 = ema5 > ema20 && prices.length >= 2 && 
    calculateEMA(prices.slice(0, -1), 5) <= calculateEMA(prices.slice(0, -1), 20);
  const ema5CrossBelow20 = ema5 < ema20 && prices.length >= 2 && 
    calculateEMA(prices.slice(0, -1), 5) >= calculateEMA(prices.slice(0, -1), 20);
  
  // Short-term price changes (for scalping)
  const priceChange5m = prices.length >= 2 ? ((currentPrice - prices[prices.length - 2]) / prices[prices.length - 2]) * 100 : 0;
  const priceChange15m = prices.length >= 4 ? ((currentPrice - prices[prices.length - 4]) / prices[prices.length - 4]) * 100 : 0;
  const priceChange30m = prices.length >= 7 ? ((currentPrice - prices[prices.length - 7]) / prices[prices.length - 7]) * 100 : 0;
  
  // Volume analysis
  const volumes = recentCandles.map(c => c.volume);
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  const hasVolumeConfirmation = volumeRatio >= 1.3; // Require 1.3x volume for entries
  
  // Calculate VWAP for mean-reversion
  const vwap = calculateVWAP(recentCandles.slice(-50));
  const priceVsVwap = ((currentPrice - vwap) / vwap) * 100;
  
  // Calculate ATR for volatility filter
  const highs = recentCandles.slice(-14).map(c => c.high);
  const lows = recentCandles.slice(-14).map(c => c.low);
  const closes = recentCandles.slice(-14).map(c => c.close);
  let atrSum = 0;
  for (let i = 1; i < 14; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
    atrSum += tr;
  }
  const atr = atrSum / 14;
  const atrPercent = (atr / currentPrice) * 100;
  
  // EMA pullback detection - price pulling back to fast EMA in uptrend
  const emaPullback = emaFast > emaSlow && currentPrice <= emaFast * 1.002 && currentPrice >= emaFast * 0.995;
  
  // Scalping signal scoring (REFINED for better entries)
  let bullScore = 0;
  let bearScore = 0;
  
  // MICRO-TREND: 5/20 EMA (AI requested - high weight)
  if (microTrendBullish) bullScore += 2;
  if (!microTrendBullish) bearScore += 2;
  if (ema5CrossAbove20) bullScore += 2; // Fresh bullish cross = strong signal
  if (ema5CrossBelow20) bearScore += 2;
  
  // ROC momentum bonus
  if (roc3 > 0.05 && roc5 > 0) bullScore += 1; // Accelerating up
  if (roc3 < -0.05 && roc5 < 0) bearScore += 1; // Accelerating down
  
  // EMA crosses (using configurable periods)
  if (ema5 > emaFast) bullScore += 1.5;
  if (ema5 < emaFast) bearScore += 1.5;
  if (emaFast > emaSlow) bullScore += 1;
  if (emaFast < emaSlow) bearScore += 1;
  
  // RSI signals (using configurable threshold)
  if (rsi < rsiOversold) bullScore += 2;
  if (rsi > (100 - rsiOversold)) bearScore += 2;
  if (rsi < (rsiOversold + 10)) bullScore += 1;
  if (rsi > (100 - rsiOversold - 10)) bearScore += 1;
  
  // Bollinger signals
  if (bollinger.percentB < 20) bullScore += 2;
  if (bollinger.percentB > 80) bearScore += 2;
  
  // Volume spike (using configurable threshold) - gives bonus but not required here
  if (volumeRatio > volumeThreshold) {
    bullScore += 1;
    bearScore += 1;
  }
  
  // MACD
  if (macd.histogram > 0) bullScore += 1;
  if (macd.histogram < 0) bearScore += 1;
  
  // Momentum - INCREASED WEIGHT for strong moves
  if (momentum > 0.5) bullScore += 2;       // Strong bullish momentum = 2 points
  else if (momentum > 0.3) bullScore += 1;
  if (momentum < -0.5) bearScore += 2;      // Strong bearish momentum = 2 points
  else if (momentum < -0.3) bearScore += 1;
  
  // VWAP signals - price below VWAP in uptrend is bullish (mean reversion)
  if (priceVsVwap < -0.2 && emaFast > emaSlow) bullScore += 1.5;  // Below VWAP in uptrend
  if (priceVsVwap > 0.3 && emaFast < emaSlow) bearScore += 1.5;   // Above VWAP in downtrend
  
  // EMA pullback bonus - price pulling back to EMA in uptrend
  if (emaPullback) bullScore += 2;
  
  // Apply MTF trend bonus to signal scoring (increased from 1.5 to 2.0 for aligned)
  bullScore += mtfAnalysis.alignment === 'aligned_bull' ? 2.0 : trendBonus;
  
  const strongSignal = Math.max(bullScore, bearScore) >= 6;
  
  // Position status
  const positionStatus = position && position.amount > 0 
    ? `HOLDING: Entry $${position.entryPrice.toFixed(6)}, P/L: ${(((currentPrice - position.entryPrice) / position.entryPrice) * 100).toFixed(2)}%`
    : 'NO POSITION';

  // Determine if market is choppy (low ATR)
  const isChoppy = atrPercent < antiChopAtr;
  const signalBias = bullScore > bearScore ? 'BULLISH' : bearScore > bullScore ? 'BEARISH' : 'NEUTRAL';
  
  // ============== BUILD PRICE NARRATIVE (Rolling Context) ==============
  // Last 12 candles (1 hour) as a visual story of what's happening
  const narrativeCandles = recentCandles.slice(-12);
  const priceNarrative = narrativeCandles.map((c, idx) => {
    const change = ((c.close - c.open) / c.open) * 100;
    const color = c.close > c.open ? '🟢' : '🔴';
    const size = Math.abs(change) > 0.3 ? 'BIG' : Math.abs(change) > 0.1 ? 'med' : 'tiny';
    return `${color}${change >= 0 ? '+' : ''}${change.toFixed(2)}%(${size})`;
  }).join(' → ');
  
  // Detect pattern in last 12 candles
  const greenCount = narrativeCandles.filter(c => c.close > c.open).length;
  const redCount = narrativeCandles.filter(c => c.close < c.open).length;
  const trendDescription = greenCount >= 8 ? 'Strong uptrend building' : 
                          redCount >= 8 ? 'Strong downtrend' :
                          greenCount >= 6 ? 'Bullish momentum developing' :
                          redCount >= 6 ? 'Bearish pressure' : 'Choppy/consolidating';
  
  // Higher-high / Lower-low detection
  const last4Highs = narrativeCandles.slice(-4).map(c => c.high);
  const last4Lows = narrativeCandles.slice(-4).map(c => c.low);
  const higherHighs = last4Highs[3] > last4Highs[2] && last4Highs[2] > last4Highs[1];
  const lowerLows = last4Lows[3] < last4Lows[2] && last4Lows[2] < last4Lows[1];
  const structureDesc = higherHighs ? '** HIGHER HIGHS - Bullish structure **' : 
                       lowerLows ? '** LOWER LOWS - Bearish structure **' : '';

  // Watching state context
  const watchingContext = watchingState.pattern 
    ? `\nWATCHING: "${watchingState.pattern}" for ${index - watchingState.since} candles`
    : '';
  
  // Build AI prompt with MULTI-TIMEFRAME scalping context + VWAP + PRICE NARRATIVE
  const prompt = `You are a PROFESSIONAL scalper using MULTI-TIMEFRAME ANALYSIS for ${symbol}.

HIGHER TIMEFRAME TREND (Trade WITH this direction):
- 1H: ${mtfAnalysis.htf1h.direction.toUpperCase()} (Mom: ${mtfAnalysis.htf1h.momentum.toFixed(1)}%)
- 4H: ${mtfAnalysis.htf4h.direction.toUpperCase()} (Mom: ${mtfAnalysis.htf4h.momentum.toFixed(1)}%)
${mtfAnalysis.alignment === 'aligned_bull' ? '** BULLISH ALIGNMENT - SCALP LONGS **' : 
  mtfAnalysis.alignment === 'aligned_bear' ? '** BEARISH - AVOID LONGS **' : 'Neutral/Mixed trend'}

PRICE ACTION (Last 1 hour - watch the story develop):
${priceNarrative}
Pattern: ${trendDescription} (${greenCount} green, ${redCount} red)
${structureDesc}${watchingContext}

CURRENT STATE (${currentTime.toISOString()}):
- Price: $${currentPrice.toFixed(6)}
- VWAP: $${vwap.toFixed(6)} (${priceVsVwap >= 0 ? '+' : ''}${priceVsVwap.toFixed(2)}%) ${priceVsVwap < 0 ? '** BELOW VWAP **' : ''}
- ATR: ${atrPercent.toFixed(3)}% ${isChoppy ? '(CHOPPY)' : atrPercent > 0.3 ? '(VOLATILE-GOOD)' : ''}

MICRO-TREND (5/20 EMA - AI requested):
- 5 EMA vs 20 EMA: ${microTrendBullish ? 'BULLISH' : 'BEARISH'}${ema5CrossAbove20 ? ' *** JUST CROSSED UP ***' : ema5CrossBelow20 ? ' *** JUST CROSSED DOWN ***' : ''}
- ROC (Rate of Change): 3-candle: ${roc3 >= 0 ? '+' : ''}${roc3.toFixed(3)}% | 5-candle: ${roc5 >= 0 ? '+' : ''}${roc5.toFixed(3)}%
- Momentum direction: ${roc3 > 0 && roc5 > 0 ? 'ACCELERATING UP' : roc3 < 0 && roc5 < 0 ? 'ACCELERATING DOWN' : 'MIXED'}

SIGNAL SCORE: Bull=${bullScore.toFixed(1)} vs Bear=${bearScore.toFixed(1)} ${strongSignal ? '*** STRONG ***' : ''}
- RSI: ${rsi.toFixed(1)} ${rsi < rsiOversold ? '(OVERSOLD-BUY)' : rsi > (100 - rsiOversold) ? '(OVERBOUGHT)' : ''}
- EMA: ${emaFast > emaSlow ? 'Bullish' : 'Bearish'}${emaPullback ? ' ** PULLBACK **' : ''} | Vol: ${volumeRatio.toFixed(2)}x

POSITION: ${positionStatus}

STRATEGY: You are WATCHING the market continuously. Only act when:
1. MTF is BULLISH aligned (1H+4H both bullish)
2. Pattern shows clear momentum building (6+ green candles)
3. Higher highs forming OR clear reversal from support
4. Bull score >= 4.5 AND dominates bear by 1.2x
5. Stop: 0.5% | Target: 0.5%

JSON: {"action": "buy"/"sell"/"hold", "confidence": 50-95, "reasoning": "brief"}`;

  // ============== PRE-FILTER: Only call AI when something interesting ==============
  // LOOSENED: Wake AI more often, but it should be picky about when to enter
  const somethingInteresting = 
    bullScore >= 3.5 ||                       // Moderate bullish signal (lowered from strongSignal)
    mtfAnalysis.alignment === 'aligned_bull' ||  // Any bullish MTF alignment
    greenCount >= 3 ||                        // Building momentum (lowered from 5)
    higherHighs ||                            // Structure change
    emaPullback ||                            // Pullback entry opportunity
    rsi < 40 ||                               // Getting oversold (loosened from rsiOversold)
    volumeRatio > 1.3 ||                      // Volume spike
    position !== null ||                      // Already in position - need to monitor
    watchingState.pattern !== null;           // Already watching something
    
  if (!somethingInteresting) {
    // Nothing worth waking the AI for - just keep quiet
    return makeResult('hold', 30, 'Watching... waiting for setup');
  }

  try {
    console.log(`[AI-SCALPER-BACKTEST] Analyzing ${symbol} - Bull: ${bullScore.toFixed(1)}, Bear: ${bearScore.toFixed(1)}, Pattern: ${trendDescription}`);
    const response = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, // Deterministic for consistent backtests
      max_tokens: 200,
    });
    
    const content = response.choices[0]?.message?.content || '';
    
    // Handle thinking tags from some models
    let jsonContent = content;
    if (content.includes('<think>')) {
      jsonContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }
    
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const aiAction = parsed.action?.toLowerCase() as 'buy' | 'sell' | 'hold';
      const aiConfidence = Math.min(100, Math.max(0, parsed.confidence || 50));
      
      // SIGNAL SCORING IS PRIMARY - AI only confirms or boosts
      // LOOSENED FILTERS: Maximize trades for data collection
      // MTF alignment is already a bonus in bullScore (+2 points), not a hard requirement
      const minScoreForEntry = isChoppy ? 4.0 : 3.0; // LOOSENED: 3.0 normal, 4.0 choppy (was 4.0/5.0)
      const minScoreForExit = 3.0;
      
      // PULLBACK FILTER: Prefer entries near value, but don't require it
      const nearVwap = Math.abs(priceVsVwap) < 0.5; // Within 0.5% of VWAP (widened)
      const nearEma = Math.abs(((currentPrice - emaSlow) / emaSlow) * 100) < 0.6; // Within 0.6% of slow EMA
      const goodEntry = nearVwap || nearEma || emaPullback || priceVsVwap < 0; // At value or pullback
      
      // BUY logic: LOOSENED for more data
      // 1. Bull score >= 3.0 (lowered from 4.0)
      // 2. Bull must dominate bear by 1.1x (lowered from 1.3x)
      // 3. MTF alignment adds points but not required
      // 4. Last candle green NOT required
      const qualityEntry = bullScore >= minScoreForEntry && bullScore > bearScore * 1.1;
      
      if (!position && qualityEntry) {
        const baseConfidence = Math.min(85, 55 + bullScore * 5);
        const vwapBonus = priceVsVwap < 0 ? 3 : 0;
        const pullbackBonus = emaPullback ? 3 : 0;
        const finalConfidence = Math.min(95, baseConfidence + (aiAction === 'buy' ? 8 : 0) + vwapBonus + pullbackBonus);
        return makeResult('buy', finalConfidence, 
          `Scalp entry: Bull ${bullScore.toFixed(1)} MTF-aligned${emaPullback ? ' (pullback)' : ''}${priceVsVwap < 0 ? ' (below VWAP)' : ''}${aiAction === 'buy' ? ' (AI confirms)' : ''}`, 
          resetState);
      }
      
      // SELL logic: Tight stop-loss to limit damage per trade
      if (position) {
        const pnl = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const targetProfit = config.scalpingTargetPercent || 0.5;
        const stopLoss = 0.3; // TIGHTENED: 0.3% stop - limit damage, high quality entries compensate
        
        // Take profit at target
        if (pnl >= targetProfit) {
          return makeResult('sell', 90, `Scalp profit: +${pnl.toFixed(2)}%`, resetState);
        }
        
        // Cut losses at stop
        if (pnl <= -stopLoss) {
          return makeResult('sell', 85, `Scalp stop: ${pnl.toFixed(2)}%`, resetState);
        }
        
        // Bearish signals - exit quickly
        if (bearScore >= minScoreForExit && bearScore > bullScore * 1.1) {
          return makeResult('sell', Math.min(80, 55 + bearScore * 5), 
            `Scalp exit: Bear ${bearScore.toFixed(1)} (P/L: ${pnl.toFixed(2)}%)`, resetState);
        }
        
        // RSI extreme - quick exit
        if (rsi > 75 && pnl > 0.2) {
          return makeResult('sell', 80, `RSI ${rsi.toFixed(0)}, locking ${pnl.toFixed(2)}%`, resetState);
        }
      }
      
      return makeResult('hold', aiConfidence, 'Scalper: Waiting for signal');
    }
  } catch (error) {
    console.log(`[AI-SCALPER-BACKTEST] API error, using signal scoring: ${error}`);
  }
  
  // Fallback to pure signal scoring if AI fails
  // LOOSENED: Same as AI path for consistency
  const minScore = isChoppy ? 4.0 : 3.0; // LOOSENED: Match AI path
  
  // LOOSENED: No MTF or green candle requirement - more trades for data
  const qualityEntryFallback = bullScore >= minScore && bullScore > bearScore * 1.1;
  
  if (!position && qualityEntryFallback) {
    const baseConf = Math.min(85, 55 + bullScore * 5);
    const bonus = (priceVsVwap < 0 ? 3 : 0) + (emaPullback ? 3 : 0);
    return makeResult('buy', Math.min(92, baseConf + bonus), `Scalp buy: Bull ${bullScore.toFixed(1)} MTF-aligned${emaPullback ? ' (pullback)' : ''}`, resetState);
  } else if (position) {
    const pnl = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    const targetProfit = config.scalpingTargetPercent || 0.5;
    const stopLoss = 0.3; // TIGHTENED: 0.3% stop
    
    if (pnl >= targetProfit) return makeResult('sell', 90, `Scalp profit: +${pnl.toFixed(2)}%`, resetState);
    if (pnl <= -stopLoss) return makeResult('sell', 85, `Scalp stop: ${pnl.toFixed(2)}%`, resetState);
    if (bearScore >= 3.0 && bearScore > bullScore * 1.1) {
      return makeResult('sell', Math.min(80, 55 + bearScore * 5), `Scalp sell: Bear ${bearScore.toFixed(1)}`, resetState);
    }
  }
  
  return makeResult('hold', 50, 'Scalper: No signal');
}

// Generate trading signals based on strategy
function generateSignal(
  candles: OHLCData[],
  index: number,
  config: BacktestConfig,
  position: { amount: number; entryPrice: number } | null
): 'buy' | 'sell' | 'hold' {
  if (index < 30) return 'hold'; // Need enough data for indicators
  
  const recentCandles = candles.slice(Math.max(0, index - 50), index + 1);
  const prices = recentCandles.map(c => c.close);
  const currentPrice = candles[index].close;
  
  // Check stop-loss / take-profit if we have a position
  if (position && position.amount > 0) {
    const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    // Stop-loss triggered
    if (pnlPercent <= -config.stopLossPercent) {
      return 'sell';
    }
    
    // Take-profit triggered
    if (pnlPercent >= config.takeProfitPercent) {
      return 'sell';
    }
  }
  
  switch (config.strategy) {
    case 'momentum': {
      const momentum = calculateMomentum(prices, config.momentumPeriod || 10);
      const threshold = config.momentumThreshold || 2;
      
      if (!position && momentum > threshold) {
        return 'buy';
      } else if (position && momentum < -threshold) {
        return 'sell';
      }
      break;
    }
    
    case 'mean_reversion': {
      const rsi = calculateRSI(prices, config.rsiPeriod || 14);
      const oversold = config.rsiOversold || 30;
      const overbought = config.rsiOverbought || 70;
      
      if (!position && rsi < oversold) {
        return 'buy';
      } else if (position && rsi > overbought) {
        return 'sell';
      }
      break;
    }
    
    case 'scalping': {
      const emaFast = calculateEMA(prices, config.emaFast || 9);
      const emaSlow = calculateEMA(prices, config.emaSlow || 21);
      const rsi = calculateRSI(prices, 14);
      
      // Scalping: Quick entries on EMA crossovers with RSI confirmation
      if (!position) {
        if (emaFast > emaSlow && rsi > 40 && rsi < 70) {
          return 'buy';
        }
      } else {
        // Quick exit on reverse crossover or target hit
        const scalpTarget = config.scalpingTargetPercent || 0.5;
        const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        
        if (pnlPercent >= scalpTarget || emaFast < emaSlow) {
          return 'sell';
        }
      }
      break;
    }
    
    case 'combined': {
      const momentum = calculateMomentum(prices, 10);
      const rsi = calculateRSI(prices, 14);
      const emaFast = calculateEMA(prices, 9);
      const emaSlow = calculateEMA(prices, 21);
      
      // Combined: Multiple confirmations needed
      let bullSignals = 0;
      let bearSignals = 0;
      
      if (momentum > 1) bullSignals++;
      if (momentum < -1) bearSignals++;
      if (rsi < 40) bullSignals++;
      if (rsi > 60) bearSignals++;
      if (emaFast > emaSlow) bullSignals++;
      if (emaFast < emaSlow) bearSignals++;
      
      if (!position && bullSignals >= 2) {
        return 'buy';
      } else if (position && bearSignals >= 2) {
        return 'sell';
      }
      break;
    }
  }
  
  return 'hold';
}

// Main backtesting function
export async function runBacktest(
  userId: string,
  name: string,
  config: BacktestConfig
): Promise<BacktestMetrics> {
  console.log(`[BACKTEST] Starting backtest "${name}" for ${config.symbol}`);
  console.log(`[BACKTEST] Strategy: ${config.strategy}, Period: ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);
  
  // Initialize progress tracking
  updateProgress(userId, {
    percent: 0,
    message: 'Initializing backtest...',
    phase: 'fetching',
    currentCandle: 0,
    totalCandles: 0,
    aiCalls: 0,
    startTime: Date.now()
  });
  
  try {
    // Fetch user's bot settings for custom AI endpoint (same as live trading)
    const botSettings = await storage.getBotSettings(userId);
    const customEndpoint = botSettings?.customAiEndpoint || null;
    const customModel = botSettings?.customAiModel || (customEndpoint ? 'local-model' : 'gpt-4o-mini');
    
    // Create AI client based on user's settings
    const aiClient = getOpenAIClientWithConfig(customEndpoint);
    console.log(`[BACKTEST] AI Configuration: ${customEndpoint ? `Custom endpoint (${customModel})` : `OpenAI (${customModel})`}`);
    
    updateProgress(userId, {
      percent: 5,
      message: 'Fetching historical price data from Kraken...',
      phase: 'fetching'
    });
    
    // Fetch historical data - automatically select candle interval based on date range
    // Kraken returns max ~720 candles per request, so use larger intervals for longer periods
    const startTimestamp = Math.floor(config.startDate.getTime() / 1000);
    const endTimestamp = Math.floor(config.endDate.getTime() / 1000);
    const durationDays = (endTimestamp - startTimestamp) / (24 * 60 * 60);
    
    // Select candle interval: 5min for <3 days, 15min for 3-7 days, 30min for >7 days
    let candleIntervalMinutes = 5;
    if (durationDays > 7) {
      candleIntervalMinutes = 30;
    } else if (durationDays > 3) {
      candleIntervalMinutes = 15;
    }
    
    console.log(`[BACKTEST] Date range: ${durationDays.toFixed(1)} days, using ${candleIntervalMinutes}-min candles`);
    
    const candles = await fetchHistoricalOHLC(config.symbol, candleIntervalMinutes, startTimestamp);
    console.log(`[BACKTEST] Loaded ${candles.length} candles (${candleIntervalMinutes}-min interval)`);
  
    if (candles.length === 0) {
      updateProgress(userId, { phase: 'error', message: 'No historical data available' });
      clearProgress(userId);
      throw new Error(`No historical data available for ${config.symbol}`);
    }
    
    
    updateProgress(userId, {
      percent: 10,
      message: 'Filtering and preparing candle data...',
      phase: 'calculating'
    });
    
    // Filter candles to our date range
    const filteredCandles = candles.filter(c => 
      c.timestamp >= config.startDate.getTime() && 
      c.timestamp <= config.endDate.getTime()
    );
    
    if (filteredCandles.length < 30) {
      updateProgress(userId, { phase: 'error', message: 'Insufficient data' });
      clearProgress(userId);
      throw new Error(`Insufficient data for backtesting (need at least 30 candles, got ${filteredCandles.length})`);
    }
    
    updateProgress(userId, {
      percent: 15,
      message: `Processing ${filteredCandles.length} candles...`,
      phase: 'simulating',
      totalCandles: filteredCandles.length
    });
    
    // Initialize simulation state
    let usdBalance = config.startingBalance;
    let position: { amount: number; entryPrice: number; entryTime: number; highWaterMark?: number } | null = null;
    const trades: BacktestTrade[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];
    let peakEquity = config.startingBalance;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    const returns: number[] = [];
    let lastEquity = config.startingBalance;
    let aiCallCount = 0;
    
    // AI Scalper "Watching Mode" state - persists across candles
    let watchingState: {
      pattern: string | null;       // What pattern AI is watching for
      since: number;                // Candle index when watching started
      lastCheckScore: number;       // Last bull/bear score differential
      consecutiveSetups: number;    // How many candles showed setup building
    } = { pattern: null, since: 0, lastCheckScore: 0, consecutiveSetups: 0 };
    
    // Run simulation
    for (let i = 0; i < filteredCandles.length; i++) {
      const candle = filteredCandles[i];
      const currentPrice = candle.close;
      
      // Update progress every 50 candles to avoid too many updates
      if (i % 50 === 0) {
        // Progress goes from 15% to 90% during simulation
        const simulationProgress = 15 + ((i / filteredCandles.length) * 75);
        updateProgress(userId, {
          percent: Math.round(simulationProgress),
          message: `Processing candle ${i + 1} of ${filteredCandles.length}...`,
          currentCandle: i,
          aiCalls: aiCallCount
        });
      }
      
      // Calculate current equity
      const positionValue = position ? position.amount * currentPrice : 0;
      const currentEquity = usdBalance + positionValue;
      
      // Track equity curve (sample every 10 candles to reduce data)
      if (i % 10 === 0) {
        equityCurve.push({ timestamp: candle.timestamp, equity: currentEquity });
      }
      
      // Track returns for Sharpe ratio
      const returnPct = ((currentEquity - lastEquity) / lastEquity) * 100;
      returns.push(returnPct);
      lastEquity = currentEquity;
      
      // Track drawdown
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const drawdown = peakEquity - currentEquity;
      const drawdownPercent = (drawdown / peakEquity) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
      
      // Generate signal (AI strategy is async and rate-limited)
      let signal: 'buy' | 'sell' | 'hold' = 'hold';
      let signalReason = '';
      
      if (config.strategy === 'ai') {
        // AI strategy with trailing stop and timeout (like AI Scalper but less aggressive)
        const trailingPercent = config.aiScalperTrailingPercent || 1.0; // 1% trailing for regular AI
        const timeoutMinutes = config.aiScalperTimeoutMinutes || 240; // 4 hour timeout for regular AI
        
        // Check exits first if we have a position
        if (position) {
          const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          const holdTimeMinutes = (candle.timestamp - position.entryTime) / 60000;
          
          // Update high water mark for trailing stop
          if (!position.highWaterMark || currentPrice > position.highWaterMark) {
            position.highWaterMark = currentPrice;
          }
          
          // Check trailing stop (from high water mark) - only if in profit
          const dropFromPeak = ((position.highWaterMark - currentPrice) / position.highWaterMark) * 100;
          if (pnlPercent > 0.5 && dropFromPeak >= trailingPercent) {
            signal = 'sell';
            signalReason = `Trailing stop: ${dropFromPeak.toFixed(2)}% drop from peak, locking ${pnlPercent.toFixed(2)}% profit`;
          }
          // Check timeout - exit if holding too long without significant profit
          else if (holdTimeMinutes >= timeoutMinutes && pnlPercent < 1.0) {
            signal = 'sell';
            signalReason = `Timeout: ${holdTimeMinutes.toFixed(0)}min, P/L: ${pnlPercent.toFixed(2)}%`;
          }
        }
        
        // AI signal generation (only if no exit signal triggered)
        if (signal === 'hold') {
          // AI strategy: only check every 12 candles (1 hour) to limit API calls and speed up backtest
          if (i % 12 === 0 || (position && i % 6 === 0)) {
            console.log(`[BACKTEST-DEBUG] AI call at candle ${i}, position: ${position ? 'yes' : 'no'}`);
            const aiResult = await generateAISignal(filteredCandles, i, config, position, config.symbol, aiClient, customModel);
            aiCallCount++;
            console.log(`[BACKTEST-DEBUG] AI result: ${aiResult.action} (${aiResult.confidence}%) - ${aiResult.reasoning.substring(0, 50)}`);
            const confidenceThreshold = config.aiConfidenceThreshold || 65;
            
            if (aiResult.confidence >= confidenceThreshold) {
              signal = aiResult.action;
              signalReason = `AI(${aiResult.confidence}%): ${aiResult.reasoning}`;
            }
          }
        }
      } else if (config.strategy === 'ai_scalper') {
        // AI Scalper Pro: Aggressive scalping with trailing stop and timeout
        const scalpingSL = config.scalpingStopPercent || 0.3;
        const scalpingTP = config.scalpingTargetPercent || 0.5;
        // REFINED: Tighter trailing stop (0.15% default instead of 0.2%) to lock profits faster
        const trailingPercent = config.aiScalperTrailingPercent || 0.15;
        const timeoutMinutes = config.aiScalperTimeoutMinutes || 15;
        
        // Check scalping exits first if we have a position
        if (position) {
          const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          const holdTimeMinutes = (candle.timestamp - position.entryTime) / 60000;
          
          // Update high water mark for trailing stop
          if (!position.highWaterMark || currentPrice > position.highWaterMark) {
            position.highWaterMark = currentPrice;
          }
          
          // Check trailing stop (from high water mark)
          const dropFromPeak = ((position.highWaterMark - currentPrice) / position.highWaterMark) * 100;
          if (pnlPercent > 0 && dropFromPeak >= trailingPercent) {
            signal = 'sell';
            signalReason = `Trailing stop: ${dropFromPeak.toFixed(2)}% drop from peak $${position.highWaterMark.toFixed(6)}`;
          }
          // Check hard stop-loss
          else if (pnlPercent <= -scalpingSL) {
            signal = 'sell';
            signalReason = `Scalp stop-loss: ${pnlPercent.toFixed(2)}%`;
          }
          // Check take-profit
          else if (pnlPercent >= scalpingTP) {
            signal = 'sell';
            signalReason = `Scalp take-profit: ${pnlPercent.toFixed(2)}%`;
          }
          // Check timeout
          else if (holdTimeMinutes >= timeoutMinutes) {
            signal = 'sell';
            signalReason = `Scalp timeout: ${holdTimeMinutes.toFixed(0)}min > ${timeoutMinutes}min limit`;
          }
        }
        
        // If no exit signal, check AI for entry/additional signals
        if (signal === 'hold') {
          // AI Scalper: check every 3 candles (15 min) for faster scalp entries
          if (i % 3 === 0 || position) {
            console.log(`[BACKTEST-DEBUG] AI Scalper call at candle ${i}, position: ${position ? 'yes' : 'no'}, watching: ${watchingState.pattern || 'none'}`);
            const aiResult = await generateAIScalperSignal(filteredCandles, i, config, position, config.symbol, aiClient, customModel, watchingState);
            aiCallCount++;
            
            // Update watching state for next iteration
            watchingState = aiResult.newWatchingState;
            
            console.log(`[BACKTEST-DEBUG] AI Scalper result: ${aiResult.action} (${aiResult.confidence}%) - ${aiResult.reasoning.substring(0, 50)}`);
            const confidenceThreshold = config.aiConfidenceThreshold || 55; // Lower threshold for scalping
            
            // Handle actions - "watching" means AI is tracking but not acting yet
            if (aiResult.action !== 'watching' && aiResult.confidence >= confidenceThreshold) {
              signal = aiResult.action as 'buy' | 'sell' | 'hold';
              signalReason = `AI-Scalper(${aiResult.confidence}%): ${aiResult.reasoning}`;
            }
          }
        }
      } else if (config.strategy === 'signal_only') {
        // SIGNAL-ONLY MODE: Fast backtesting without AI API calls
        // Uses the same signal scoring logic as AI Scalper but skips the slow AI calls
        const scalpingSL = config.scalpingStopPercent || 0.3;
        const scalpingTP = config.scalpingTargetPercent || 0.5;
        const trailingPercent = config.aiScalperTrailingPercent || 0.15;
        const timeoutMinutes = config.aiScalperTimeoutMinutes || 15;
        
        // Check scalping exits first if we have a position
        if (position) {
          const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          const holdTimeMinutes = (candle.timestamp - position.entryTime) / 60000;
          
          if (!position.highWaterMark || currentPrice > position.highWaterMark) {
            position.highWaterMark = currentPrice;
          }
          
          const dropFromPeak = ((position.highWaterMark - currentPrice) / position.highWaterMark) * 100;
          if (pnlPercent > 0 && dropFromPeak >= trailingPercent) {
            signal = 'sell';
            signalReason = `Trailing stop: ${dropFromPeak.toFixed(2)}% drop from peak`;
          } else if (pnlPercent <= -scalpingSL) {
            signal = 'sell';
            signalReason = `Stop-loss: ${pnlPercent.toFixed(2)}%`;
          } else if (pnlPercent >= scalpingTP) {
            signal = 'sell';
            signalReason = `Take-profit: ${pnlPercent.toFixed(2)}%`;
          } else if (holdTimeMinutes >= timeoutMinutes) {
            signal = 'sell';
            signalReason = `Timeout: ${holdTimeMinutes.toFixed(0)}min`;
          }
        }
        
        // Entry logic using signal scoring (no AI) - BALANCED FILTERS FOR 55-60% WIN RATE
        if (signal === 'hold' && !position) {
          // Calculate indicators
          const closes = filteredCandles.slice(0, i + 1).map(c => c.close);
          const rsi = calculateRSI(closes, config.rsiPeriod || 14);
          const emaFast = calculateEMA(closes, config.emaFast || 9);
          const emaSlow = calculateEMA(closes, config.emaSlow || 21);
          const ema50 = calculateEMA(closes, 50);
          const macd = calculateMACD(closes);
          const bollinger = calculateBollingerBands(closes, 20);
          const momentum = ((currentPrice - filteredCandles[Math.max(0, i - 10)]?.close) / filteredCandles[Math.max(0, i - 10)]?.close) * 100;
          
          // Signal scoring
          let bullScore = 0, bearScore = 0;
          
          // RSI signals (oversold = strong bull)
          if (rsi < 30) bullScore += 2;
          else if (rsi < 40) bullScore += 1;
          if (rsi > 70) bearScore += 2;
          else if (rsi > 60) bearScore += 1;
          
          // EMA alignment (fast > slow = bullish trend)
          if (emaFast > emaSlow) bullScore += 1.5;
          else bearScore += 1.5;
          
          // Price vs EMA50 (trend filter)
          if (currentPrice > ema50) bullScore += 1.5;
          else bearScore += 1.5;
          
          // MACD histogram
          if (macd.histogram > 0) bullScore += 1;
          else bearScore += 1;
          
          // Bollinger %B (mean reversion signal)
          if (bollinger.percentB < 25) bullScore += 1.5;
          else if (bollinger.percentB < 40) bullScore += 0.5;
          if (bollinger.percentB > 75) bearScore += 1.5;
          
          // Momentum
          if (momentum > 0.3) bullScore += 1;
          else if (momentum < -0.3) bearScore += 1;
          
          // PROFIT-OPTIMIZED: 52% with 29 trades was most profitable
          const minScoreForEntry = 4.0;  // Back to balanced setting
          const minRatio = 1.2;          // More trades allowed
          
          // Additional quality filter: EMA fast must be above slow (trend confirmation)
          const trendConfirmed = emaFast > emaSlow;
          
          if (bullScore >= minScoreForEntry && bullScore > bearScore * minRatio && trendConfirmed) {
            signal = 'buy';
            signalReason = `Signal buy: Bull ${bullScore.toFixed(1)} vs Bear ${bearScore.toFixed(1)} (RSI:${rsi.toFixed(0)})`;
          }
        }
        
        // Exit logic for existing position
        if (signal === 'hold' && position) {
          const rsi = calculateRSI(filteredCandles.slice(0, i + 1).map(c => c.close), config.rsiPeriod || 14);
          const emaFast = calculateEMA(filteredCandles.slice(0, i + 1).map(c => c.close), config.emaFast || 9);
          const emaSlow = calculateEMA(filteredCandles.slice(0, i + 1).map(c => c.close), config.emaSlow || 21);
          
          let bearScore = 0;
          if (rsi > 70) bearScore += 2;
          else if (rsi > 60) bearScore += 1;
          if (emaFast < emaSlow) bearScore += 1.5;
          
          if (bearScore >= 3.0) {
            const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
            signal = 'sell';
            signalReason = `Signal exit: Bear ${bearScore.toFixed(1)} (P/L: ${pnlPercent.toFixed(2)}%)`;
          }
        }
      } else {
        signal = generateSignal(filteredCandles, i, config, position);
        signalReason = config.strategy;
      }
      
      // Execute trades
      if (signal === 'buy' && !position && usdBalance >= config.tradeAmount) {
        const amount = config.tradeAmount / currentPrice;
        position = {
          amount,
          entryPrice: currentPrice,
          entryTime: candle.timestamp
        };
        usdBalance -= config.tradeAmount;
        
        trades.push({
          timestamp: candle.timestamp,
          type: 'buy',
          price: currentPrice,
          amount,
          value: config.tradeAmount,
          reason: signalReason || `${config.strategy} entry signal`
        });
      } else if (signal === 'sell' && position) {
        const sellValue = position.amount * currentPrice;
        const profitLoss = sellValue - (position.amount * position.entryPrice);
        const profitLossPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const holdingTime = (candle.timestamp - position.entryTime) / (1000 * 60);
        
        trades.push({
          timestamp: candle.timestamp,
          type: 'sell',
          price: currentPrice,
          amount: position.amount,
          value: sellValue,
          reason: profitLossPercent <= -config.stopLossPercent ? 'stop-loss' :
                 profitLossPercent >= config.takeProfitPercent ? 'take-profit' :
                 signalReason || `${config.strategy} exit signal`,
          profitLoss,
          profitLossPercent
        });
        
        usdBalance += sellValue;
        position = null;
      }
    }
  
  // Close any remaining position at the end
  if (position) {
    const lastCandle = filteredCandles[filteredCandles.length - 1];
    const sellValue = position.amount * lastCandle.close;
    const profitLoss = sellValue - (position.amount * position.entryPrice);
    const profitLossPercent = ((lastCandle.close - position.entryPrice) / position.entryPrice) * 100;
    
    trades.push({
      timestamp: lastCandle.timestamp,
      type: 'sell',
      price: lastCandle.close,
      amount: position.amount,
      value: sellValue,
      reason: 'end of backtest',
      profitLoss,
      profitLossPercent
    });
    
    usdBalance += sellValue;
    position = null;
  }
  
  // Calculate final metrics
  const sellTrades = trades.filter(t => t.type === 'sell' && t.profitLoss !== undefined);
  const winningTrades = sellTrades.filter(t => (t.profitLoss || 0) > 0);
  const losingTrades = sellTrades.filter(t => (t.profitLoss || 0) <= 0);
  
  const totalProfitLoss = usdBalance - config.startingBalance;
  const totalProfitLossPercent = (totalProfitLoss / config.startingBalance) * 100;
  
  const grossProfit = winningTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0));
  
  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0) / winningTrades.length 
    : 0;
  const avgLoss = losingTrades.length > 0 
    ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0) / losingTrades.length)
    : 0;
  
  const largestWin = winningTrades.length > 0 
    ? Math.max(...winningTrades.map(t => t.profitLoss || 0)) 
    : 0;
  const largestLoss = losingTrades.length > 0 
    ? Math.min(...losingTrades.map(t => t.profitLoss || 0)) 
    : 0;
  
  // Calculate holding times
  const holdingTimes: number[] = [];
  for (let i = 0; i < trades.length; i += 2) {
    if (trades[i + 1]) {
      holdingTimes.push((trades[i + 1].timestamp - trades[i].timestamp) / (1000 * 60));
    }
  }
  const avgHoldingTimeMinutes = holdingTimes.length > 0 
    ? Math.round(holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length) 
    : 0;
  
  // Calculate Sharpe ratio (annualized, assuming 5-min candles)
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const returnStd = returns.length > 1 
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
    : 0;
  // Annualize: 5-min candles = 105,120 per year
  const sharpeRatio = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(105120) : 0;
  
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  const metrics: BacktestMetrics = {
    totalTrades: Math.floor(trades.length / 2), // Count round trips
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0,
    totalProfitLoss,
    totalProfitLossPercent,
    startingBalance: config.startingBalance,
    endingBalance: usdBalance,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    avgWin,
    avgLoss,
    largestWin,
    largestLoss: Math.abs(largestLoss),
    avgHoldingTimeMinutes,
    trades,
    equityCurve
  };
  
    console.log(`[BACKTEST] Complete: ${metrics.totalTrades} trades, ${metrics.winRate.toFixed(1)}% win rate, ${metrics.totalProfitLossPercent.toFixed(2)}% return`);
    
    updateProgress(userId, {
      percent: 95,
      message: 'Saving results to database...',
      phase: 'finalizing'
    });
    
    // Save to database
    const insertData: InsertBacktestResult = {
      userId,
      name,
      symbol: config.symbol,
      strategy: config.strategy,
      startDate: config.startDate,
      endDate: config.endDate,
      configJson: JSON.stringify(config),
      startingBalance: config.startingBalance.toString(),
      endingBalance: usdBalance.toString(),
      totalTrades: metrics.totalTrades,
      winningTrades: metrics.winningTrades,
      losingTrades: metrics.losingTrades,
      winRate: metrics.winRate.toString(),
      totalProfitLoss: metrics.totalProfitLoss.toString(),
      totalProfitLossPercent: metrics.totalProfitLossPercent.toString(),
      maxDrawdown: metrics.maxDrawdown.toString(),
      maxDrawdownPercent: metrics.maxDrawdownPercent.toString(),
      sharpeRatio: metrics.sharpeRatio.toString(),
      profitFactor: metrics.profitFactor.toString(),
      avgWin: metrics.avgWin.toString(),
      avgLoss: metrics.avgLoss.toString(),
      largestWin: metrics.largestWin.toString(),
      largestLoss: metrics.largestLoss.toString(),
      avgHoldingTimeMinutes: metrics.avgHoldingTimeMinutes,
      tradesJson: JSON.stringify(trades),
      equityCurveJson: JSON.stringify(equityCurve)
    };
    
    await storage.saveBacktestResult(insertData);
    
    updateProgress(userId, {
      percent: 100,
      message: 'Backtest complete!',
      phase: 'complete'
    });
    clearProgress(userId);
    
    return metrics;
  } catch (error) {
    updateProgress(userId, { phase: 'error', message: `Error: ${error}` });
    clearProgress(userId);
    throw error;
  }
}

// Get all backtest results for a user
export async function getBacktestResults(userId: string) {
  return storage.getBacktestResults(userId);
}

// Delete a backtest result
export async function deleteBacktestResult(userId: string, backtestId: number) {
  return storage.deleteBacktestResult(userId, backtestId);
}
