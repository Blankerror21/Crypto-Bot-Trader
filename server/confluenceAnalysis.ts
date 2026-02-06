export interface TimeframeSignal {
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

export interface ConfluenceResult {
  symbol: string;
  overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confluenceScore: number;
  timeframes: TimeframeSignal[];
  alignment: number;
  recommendation: string;
  shouldTrade: boolean;
  timestamp: number;
}

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

const candleHistories: Map<string, Map<string, CandleData[]>> = new Map();

export function updateCandleHistory(
  symbol: string, 
  timeframe: string, 
  candles: CandleData[]
): void {
  if (!candleHistories.has(symbol)) {
    candleHistories.set(symbol, new Map());
  }
  candleHistories.get(symbol)!.set(timeframe, candles);
}

export function getCandleHistory(symbol: string, timeframe: string): CandleData[] {
  const symbolHistory = candleHistories.get(symbol);
  if (!symbolHistory) return [];
  return symbolHistory.get(timeframe) || [];
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);
  
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }
  
  return ema;
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } | null {
  if (prices.length < 26) return null;
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  if (ema12.length === 0 || ema26.length === 0) return null;
  
  const macdLine: number[] = [];
  const offset = ema12.length - ema26.length;
  
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }
  
  const signalLine = calculateEMA(macdLine, 9);
  if (signalLine.length === 0) return null;
  
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  
  return {
    macd: lastMACD,
    signal: lastSignal,
    histogram: lastMACD - lastSignal
  };
}

function analyzeTimeframe(candles: CandleData[]): TimeframeSignal {
  if (!candles || candles.length < 30) {
    return {
      timeframe: 'unknown',
      signal: 'neutral',
      strength: 0
    };
  }
  
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  
  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  
  const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ma50 = closes.length >= 50 
    ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 
    : ma20;
  
  let rsiScore = 0;
  let macdScore = 0;
  let ma20Score = 0;
  let ma50Score = 0;
  let rangeScore = 0;
  
  if (rsi < 30) rsiScore = 2;
  else if (rsi < 40) rsiScore = 1;
  else if (rsi > 70) rsiScore = -2;
  else if (rsi > 60) rsiScore = -1;
  
  if (macd) {
    if (macd.histogram > 0 && macd.macd > macd.signal) macdScore = 1.5;
    else if (macd.histogram < 0 && macd.macd < macd.signal) macdScore = -1.5;
  }
  
  if (currentPrice > ma20) ma20Score = 0.5;
  else if (currentPrice < ma20) ma20Score = -0.5;
  
  if (currentPrice > ma50) ma50Score = 0.5;
  else if (currentPrice < ma50) ma50Score = -0.5;
  
  const recentHigh = Math.max(...closes.slice(-10));
  const recentLow = Math.min(...closes.slice(-10));
  const range = recentHigh - recentLow;
  const position = range > 0 ? (currentPrice - recentLow) / range : 0.5;
  
  if (position > 0.8) rangeScore = -0.5;
  else if (position < 0.2) rangeScore = 0.5;
  
  const signalScore = rsiScore + macdScore + ma20Score + ma50Score + rangeScore;
  
  let signal: 'bullish' | 'bearish' | 'neutral';
  if (signalScore > 1.0) signal = 'bullish';
  else if (signalScore < -1.0) signal = 'bearish';
  else signal = 'neutral';
  
  const strength = Math.min(100, Math.abs(signalScore) * 20);
  
  let macdSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (macd) {
    if (macd.histogram > 0) macdSignal = 'bullish';
    else if (macd.histogram < 0) macdSignal = 'bearish';
  }
  
  let trendDirection: 'up' | 'down' | 'sideways';
  if (ma20 > ma50 * 1.01) trendDirection = 'up';
  else if (ma20 < ma50 * 0.99) trendDirection = 'down';
  else trendDirection = 'sideways';
  
  let priceVsMA: 'above' | 'below' | 'at';
  if (currentPrice > ma20 * 1.005) priceVsMA = 'above';
  else if (currentPrice < ma20 * 0.995) priceVsMA = 'below';
  else priceVsMA = 'at';
  
  return {
    timeframe: 'unknown',
    signal,
    strength,
    rsi,
    macdSignal,
    trendDirection,
    priceVsMA,
    contributions: {
      rsiScore,
      macdScore,
      ma20Score,
      ma50Score,
      rangeScore,
      totalScore: signalScore
    }
  };
}

export function calculateConfluence(symbol: string): ConfluenceResult {
  const timeframeNames = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
  const timeframeWeights = {
    '1m': 0.08,
    '5m': 0.10,
    '15m': 0.14,
    '30m': 0.14,
    '1h': 0.18,
    '4h': 0.18,
    '1d': 0.18
  };
  
  const symbolHistory = candleHistories.get(symbol);
  const signals: TimeframeSignal[] = [];
  
  console.log(`[CONFLUENCE] ${symbol}: Has history=${!!symbolHistory}, keys=${symbolHistory ? Array.from(symbolHistory.keys()).join(',') : 'none'}`);
  
  for (const tf of timeframeNames) {
    const candles = symbolHistory?.get(tf) || [];
    console.log(`[CONFLUENCE] ${symbol} ${tf}: ${candles.length} candles`);
    const analysis = analyzeTimeframe(candles);
    analysis.timeframe = tf;
    signals.push(analysis);
    console.log(`[CONFLUENCE] ${symbol} ${tf}: signal=${analysis.signal}, strength=${analysis.strength}, rsi=${analysis.rsi}`);
  }
  
  let weightedScore = 0;
  let totalWeight = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  
  for (const signal of signals) {
    const weight = timeframeWeights[signal.timeframe as keyof typeof timeframeWeights] || 0.1;
    
    if (signal.signal === 'bullish') {
      weightedScore += signal.strength * weight;
      bullishCount++;
    } else if (signal.signal === 'bearish') {
      weightedScore -= signal.strength * weight;
      bearishCount++;
    }
    
    totalWeight += weight;
  }
  
  const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  
  const alignment = Math.max(bullishCount, bearishCount) / signals.length;
  
  let overallSignal: ConfluenceResult['overallSignal'];
  if (normalizedScore > 60 && alignment >= 0.8) overallSignal = 'strong_buy';
  else if (normalizedScore > 30) overallSignal = 'buy';
  else if (normalizedScore < -60 && alignment >= 0.8) overallSignal = 'strong_sell';
  else if (normalizedScore < -30) overallSignal = 'sell';
  else overallSignal = 'neutral';
  
  const shouldTrade = Math.abs(normalizedScore) > 25 && alignment >= 0.6;
  
  let recommendation: string;
  if (overallSignal === 'strong_buy') {
    recommendation = `Strong BUY signal - ${bullishCount}/${signals.length} timeframes bullish with ${alignment.toFixed(0)}% alignment`;
  } else if (overallSignal === 'buy') {
    recommendation = `BUY signal - ${bullishCount}/${signals.length} timeframes bullish`;
  } else if (overallSignal === 'strong_sell') {
    recommendation = `Strong SELL signal - ${bearishCount}/${signals.length} timeframes bearish with ${alignment.toFixed(0)}% alignment`;
  } else if (overallSignal === 'sell') {
    recommendation = `SELL signal - ${bearishCount}/${signals.length} timeframes bearish`;
  } else {
    recommendation = `NEUTRAL - Mixed signals across timeframes (${bullishCount} bullish, ${bearishCount} bearish)`;
  }
  
  return {
    symbol,
    overallSignal,
    confluenceScore: normalizedScore,
    timeframes: signals,
    alignment: alignment * 100,
    recommendation,
    shouldTrade,
    timestamp: Date.now()
  };
}

export function getConfluenceForAI(symbol: string): string {
  const confluence = calculateConfluence(symbol);
  
  const tfSummary = confluence.timeframes
    .map(tf => `${tf.timeframe}: ${tf.signal.toUpperCase()} (RSI:${tf.rsi?.toFixed(0) || 'N/A'})`)
    .join(', ');
  
  return `Multi-Timeframe Confluence: ${confluence.overallSignal.toUpperCase()} (score: ${confluence.confluenceScore.toFixed(1)}, alignment: ${confluence.alignment.toFixed(0)}%). Timeframes: ${tfSummary}. ${confluence.recommendation}`;
}
