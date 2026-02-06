// Technical Indicators Engine for AI Trading Bot
// Calculates RSI, MACD, SMA, EMA, and other technical indicators from price history

export interface TechnicalIndicators {
  rsi: number | null;           // Relative Strength Index (0-100)
  sma20: number | null;         // 20-period Simple Moving Average
  sma50: number | null;         // 50-period Simple Moving Average
  ema5: number | null;          // 5-period EMA (micro-trend fast)
  ema12: number | null;         // 12-period Exponential Moving Average
  ema20: number | null;         // 20-period EMA (micro-trend slow)
  ema26: number | null;         // 26-period Exponential Moving Average
  macd: number | null;          // MACD line (ema12 - ema26)
  macdSignal: number | null;    // 9-period EMA of MACD
  macdHistogram: number | null; // MACD - Signal
  bollingerUpper: number | null; // Bollinger Band upper
  bollingerLower: number | null; // Bollinger Band lower
  bollingerMiddle: number | null; // Bollinger Band middle (SMA20)
  atr: number | null;           // Average True Range (volatility)
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  support: number | null;       // Recent support level
  resistance: number | null;    // Recent resistance level
  microTrend: 'bullish' | 'bearish' | 'neutral'; // 5/20 EMA crossover status
}

// Calculate Simple Moving Average
export function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

// Calculate Exponential Moving Average
export function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for initial EMA
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  
  // Calculate EMA for remaining prices
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// Calculate RSI (Relative Strength Index)
export function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  
  const recentChanges = changes.slice(-period);
  let gains = 0;
  let losses = 0;
  
  for (const change of recentChanges) {
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100; // No losses = 100% bullish
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return Math.round(rsi * 100) / 100;
}

// Calculate RSI history for divergence detection
// Returns an array of RSI values, one for each price point (where calculable)
export function calculateRSIHistory(prices: number[], period: number = 14): number[] {
  const rsiHistory: number[] = [];
  
  // Need at least period+1 prices to calculate first RSI
  if (prices.length < period + 1) {
    return rsiHistory;
  }
  
  // Calculate RSI for each point starting from period+1
  for (let i = period + 1; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    const rsi = calculateRSI(slice, period);
    if (rsi !== null) {
      rsiHistory.push(rsi);
    }
  }
  
  return rsiHistory;
}

// Calculate MACD (Moving Average Convergence Divergence)
export function calculateMACD(prices: number[]): { macd: number | null; signal: number | null; histogram: number | null } {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  if (ema12 === null || ema26 === null) {
    return { macd: null, signal: null, histogram: null };
  }
  
  const macd = ema12 - ema26;
  
  // Calculate MACD values for signal line
  if (prices.length < 35) { // Need enough data for 9-period EMA of MACD
    return { macd, signal: null, histogram: null };
  }
  
  const macdValues: number[] = [];
  for (let i = 26; i <= prices.length; i++) {
    const slice = prices.slice(0, i);
    const e12 = calculateEMA(slice, 12);
    const e26 = calculateEMA(slice, 26);
    if (e12 !== null && e26 !== null) {
      macdValues.push(e12 - e26);
    }
  }
  
  const signal = calculateEMA(macdValues, 9);
  const histogram = signal !== null ? macd - signal : null;
  
  return { macd, signal, histogram };
}

// Calculate Bollinger Bands
export function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number | null; middle: number | null; lower: number | null } {
  if (prices.length < period) {
    return { upper: null, middle: null, lower: null };
  }
  
  const sma = calculateSMA(prices, period);
  if (sma === null) return { upper: null, middle: null, lower: null };
  
  const slice = prices.slice(-period);
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * standardDeviation),
    middle: sma,
    lower: sma - (stdDev * standardDeviation)
  };
}

// Calculate Average True Range (ATR) - simplified version using price range
export function calculateATR(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;
  
  const trueRanges: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    // Simplified: using just current high-low approximated by price change
    const tr = Math.abs(prices[i] - prices[i - 1]);
    trueRanges.push(tr);
  }
  
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

// Find support and resistance levels
// Now works with as few as 5 data points using min/max fallback
export function findSupportResistance(prices: number[], lookback: number = 15): { support: number | null; resistance: number | null } {
  // Minimum 5 data points for basic support/resistance
  if (prices.length < 5) {
    return { support: null, resistance: null };
  }
  
  // Use available data up to lookback period
  const actualLookback = Math.min(lookback, prices.length);
  const recentPrices = prices.slice(-actualLookback);
  const currentPrice = prices[prices.length - 1];
  
  // Find local lows (support) and highs (resistance)
  const lows: number[] = [];
  const highs: number[] = [];
  
  for (let i = 1; i < recentPrices.length - 1; i++) {
    const prev = recentPrices[i - 1];
    const curr = recentPrices[i];
    const next = recentPrices[i + 1];
    
    if (curr < prev && curr < next) lows.push(curr);
    if (curr > prev && curr > next) highs.push(curr);
  }
  
  // Support: nearest low below current price, fallback to min price
  const supportLevels = lows.filter(l => l < currentPrice).sort((a, b) => b - a);
  const support = supportLevels.length > 0 ? supportLevels[0] : Math.min(...recentPrices);
  
  // Resistance: nearest high above current price, fallback to max price
  const resistanceLevels = highs.filter(h => h > currentPrice).sort((a, b) => a - b);
  const resistance = resistanceLevels.length > 0 ? resistanceLevels[0] : Math.max(...recentPrices);
  
  return { support, resistance };
}

// Determine overall trend based on indicators
export function determineTrend(
  currentPrice: number,
  sma20: number | null,
  sma50: number | null,
  rsi: number | null,
  macd: number | null,
  macdSignal: number | null
): { trend: 'bullish' | 'bearish' | 'neutral'; strength: 'strong' | 'moderate' | 'weak' } {
  let bullishSignals = 0;
  let bearishSignals = 0;
  
  // Price vs SMA20
  if (sma20 !== null) {
    if (currentPrice > sma20 * 1.01) bullishSignals++;
    else if (currentPrice < sma20 * 0.99) bearishSignals++;
  }
  
  // Price vs SMA50
  if (sma50 !== null) {
    if (currentPrice > sma50 * 1.02) bullishSignals++;
    else if (currentPrice < sma50 * 0.98) bearishSignals++;
  }
  
  // SMA20 vs SMA50 (golden/death cross)
  if (sma20 !== null && sma50 !== null) {
    if (sma20 > sma50) bullishSignals++;
    else if (sma20 < sma50) bearishSignals++;
  }
  
  // RSI signals
  if (rsi !== null) {
    if (rsi > 70) bearishSignals++; // Overbought
    else if (rsi < 30) bullishSignals++; // Oversold
    else if (rsi > 55) bullishSignals += 0.5;
    else if (rsi < 45) bearishSignals += 0.5;
  }
  
  // MACD signals
  if (macd !== null && macdSignal !== null) {
    if (macd > macdSignal) bullishSignals++;
    else if (macd < macdSignal) bearishSignals++;
  }
  
  const totalSignals = bullishSignals + bearishSignals;
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength: 'strong' | 'moderate' | 'weak' = 'weak';
  
  if (bullishSignals > bearishSignals + 1) {
    trend = 'bullish';
    strength = bullishSignals >= 4 ? 'strong' : bullishSignals >= 2 ? 'moderate' : 'weak';
  } else if (bearishSignals > bullishSignals + 1) {
    trend = 'bearish';
    strength = bearishSignals >= 4 ? 'strong' : bearishSignals >= 2 ? 'moderate' : 'weak';
  } else {
    trend = 'neutral';
    strength = 'weak';
  }
  
  return { trend, strength };
}

// Main function: Calculate all technical indicators for a price series
export function calculateAllIndicators(prices: number[]): TechnicalIndicators {
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
  
  const rsi = calculateRSI(prices, 14);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const ema5 = calculateEMA(prices, 5);
  const ema12 = calculateEMA(prices, 12);
  const ema20 = calculateEMA(prices, 20);
  const ema26 = calculateEMA(prices, 26);
  const { macd, signal: macdSignal, histogram: macdHistogram } = calculateMACD(prices);
  const bollinger = calculateBollingerBands(prices, 20, 2);
  const atr = calculateATR(prices, 14);
  const { support, resistance } = findSupportResistance(prices, 15);
  const { trend, strength } = determineTrend(currentPrice, sma20, sma50, rsi, macd, macdSignal);
  
  // Calculate micro-trend from 5/20 EMA crossover
  let microTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (ema5 !== null && ema20 !== null) {
    const crossoverPct = ((ema5 - ema20) / ema20) * 100;
    if (crossoverPct > 0.05) microTrend = 'bullish';
    else if (crossoverPct < -0.05) microTrend = 'bearish';
  }
  
  return {
    rsi,
    sma20,
    sma50,
    ema5,
    ema12,
    ema20,
    ema26,
    macd,
    macdSignal,
    macdHistogram,
    bollingerUpper: bollinger.upper,
    bollingerLower: bollinger.lower,
    bollingerMiddle: bollinger.middle,
    atr,
    trend,
    strength,
    support,
    resistance,
    microTrend
  };
}

// Format indicators for AI prompt in human-readable form
export function formatIndicatorsForAI(indicators: TechnicalIndicators, currentPrice: number, symbol: string): string {
  const lines: string[] = [];
  
  lines.push(`=== ${symbol} TECHNICAL ANALYSIS ===`);
  
  // RSI
  if (indicators.rsi !== null) {
    let rsiInterpret = 'neutral';
    if (indicators.rsi > 70) rsiInterpret = 'OVERBOUGHT (selling pressure likely)';
    else if (indicators.rsi > 60) rsiInterpret = 'getting overbought';
    else if (indicators.rsi < 30) rsiInterpret = 'OVERSOLD (bounce likely)';
    else if (indicators.rsi < 40) rsiInterpret = 'getting oversold';
    lines.push(`- RSI(14): ${indicators.rsi.toFixed(1)} - ${rsiInterpret}`);
  }
  
  // Moving Averages
  if (indicators.sma20 !== null) {
    const vsAvg = ((currentPrice - indicators.sma20) / indicators.sma20 * 100).toFixed(2);
    const position = Number(vsAvg) > 0 ? 'ABOVE' : 'BELOW';
    lines.push(`- SMA20: $${indicators.sma20.toFixed(5)} (price is ${Math.abs(Number(vsAvg))}% ${position})`);
  }
  if (indicators.sma50 !== null) {
    const vsAvg = ((currentPrice - indicators.sma50) / indicators.sma50 * 100).toFixed(2);
    const position = Number(vsAvg) > 0 ? 'ABOVE' : 'BELOW';
    lines.push(`- SMA50: $${indicators.sma50.toFixed(5)} (price is ${Math.abs(Number(vsAvg))}% ${position})`);
  }
  
  // MACD
  if (indicators.macd !== null) {
    let macdSignalText = 'neutral';
    if (indicators.macdSignal !== null) {
      macdSignalText = indicators.macd > indicators.macdSignal ? 'BULLISH crossover' : 'BEARISH crossover';
    }
    lines.push(`- MACD: ${indicators.macd.toFixed(6)} (${macdSignalText})`);
  }
  
  // Bollinger Bands
  if (indicators.bollingerUpper !== null && indicators.bollingerLower !== null) {
    let bbPosition = 'middle';
    if (currentPrice > indicators.bollingerUpper) bbPosition = 'ABOVE upper band (overextended)';
    else if (currentPrice < indicators.bollingerLower) bbPosition = 'BELOW lower band (oversold)';
    else if (indicators.bollingerMiddle) {
      const percentB = (currentPrice - indicators.bollingerLower) / (indicators.bollingerUpper - indicators.bollingerLower) * 100;
      bbPosition = `at ${percentB.toFixed(0)}% of band width`;
    }
    lines.push(`- Bollinger Bands: ${bbPosition}`);
  }
  
  // Support/Resistance
  if (indicators.support !== null && indicators.resistance !== null) {
    const toSupport = ((indicators.support - currentPrice) / currentPrice * 100).toFixed(2);
    const toResistance = ((indicators.resistance - currentPrice) / currentPrice * 100).toFixed(2);
    lines.push(`- Support: $${indicators.support.toFixed(5)} (${Math.abs(Number(toSupport))}% away)`);
    lines.push(`- Resistance: $${indicators.resistance.toFixed(5)} (${Math.abs(Number(toResistance))}% away)`);
  }
  
  // ATR (volatility)
  if (indicators.atr !== null) {
    const atrPercent = (indicators.atr / currentPrice * 100).toFixed(2);
    lines.push(`- Volatility (ATR): ${atrPercent}% average price movement`);
  }
  
  // Overall trend
  lines.push(`- OVERALL: ${indicators.trend.toUpperCase()} trend with ${indicators.strength.toUpperCase()} signals`);
  
  return lines.join('\n');
}

// Market Regime Detection
// Determines if market is trending, ranging, or choppy based on price action
export interface MarketRegime {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'choppy';
  strength: number;     // 0-100, how strongly the regime is established
  adx: number | null;   // ADX value if calculable
  description: string;
}

// Calculate ADX (Average Directional Index) - measures trend strength
function calculateADX(prices: number[], period: number = 14): { adx: number; plusDI: number; minusDI: number } | null {
  if (prices.length < period * 2) return null;
  
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  
  // Simulate highs/lows from prices (approximate with +-1% range)
  for (let i = 0; i < prices.length; i++) {
    const volatilityFactor = 0.005; // 0.5% typical variation
    highs.push(prices[i] * (1 + volatilityFactor * (Math.random() + 0.5)));
    lows.push(prices[i] * (1 - volatilityFactor * (Math.random() + 0.5)));
    closes.push(prices[i]);
  }
  
  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevHigh = highs[i - 1];
    const prevLow = lows[i - 1];
    const prevClose = closes[i - 1];
    
    // True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
    
    // +DM and -DM
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    if (upMove > downMove && upMove > 0) {
      plusDMs.push(upMove);
    } else {
      plusDMs.push(0);
    }
    
    if (downMove > upMove && downMove > 0) {
      minusDMs.push(downMove);
    } else {
      minusDMs.push(0);
    }
  }
  
  if (trueRanges.length < period) return null;
  
  // Calculate smoothed averages
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let plusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let minusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  
  const dxValues: number[] = [];
  
  for (let i = period; i < trueRanges.length; i++) {
    atr = atr - (atr / period) + trueRanges[i];
    plusDM = plusDM - (plusDM / period) + plusDMs[i];
    minusDM = minusDM - (minusDM / period) + minusDMs[i];
    
    const plusDI = atr > 0 ? (plusDM / atr) * 100 : 0;
    const minusDI = atr > 0 ? (minusDM / atr) * 100 : 0;
    
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }
  
  if (dxValues.length < period) return null;
  
  // ADX is smoothed average of DX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
  }
  
  const finalPlusDI = plusDM / atr * 100;
  const finalMinusDI = minusDM / atr * 100;
  
  return { adx, plusDI: finalPlusDI, minusDI: finalMinusDI };
}

// Detect market regime from price history
export function detectMarketRegime(prices: number[], period: number = 20): MarketRegime {
  if (prices.length < period) {
    return { regime: 'choppy', strength: 0, adx: null, description: 'Insufficient data' };
  }
  
  const recentPrices = prices.slice(-period);
  const currentPrice = recentPrices[recentPrices.length - 1];
  const startPrice = recentPrices[0];
  
  // Calculate ADX-like trend strength
  const adxResult = calculateADX(prices, 14);
  const adx = adxResult?.adx ?? null;
  
  // Calculate directional movement
  const priceChange = ((currentPrice - startPrice) / startPrice) * 100;
  
  // Count higher highs/lower lows
  let higherHighs = 0;
  let lowerLows = 0;
  let reversals = 0;
  
  for (let i = 2; i < recentPrices.length; i++) {
    const prev2 = recentPrices[i - 2];
    const prev1 = recentPrices[i - 1];
    const curr = recentPrices[i];
    
    if (curr > prev1 && prev1 > prev2) higherHighs++;
    else if (curr < prev1 && prev1 < prev2) lowerLows++;
    
    // Count direction changes
    const prevDir = prev1 > prev2 ? 1 : -1;
    const currDir = curr > prev1 ? 1 : -1;
    if (prevDir !== currDir) reversals++;
  }
  
  const totalMoves = recentPrices.length - 2;
  const trendConsistency = Math.max(higherHighs, lowerLows) / totalMoves;
  const choppiness = reversals / totalMoves;
  
  // Calculate price range relative to movement
  const high = Math.max(...recentPrices);
  const low = Math.min(...recentPrices);
  const range = ((high - low) / low) * 100;
  const efficiency = range > 0 ? Math.abs(priceChange) / range : 0;
  
  // Determine regime
  let regime: 'trending_up' | 'trending_down' | 'ranging' | 'choppy';
  let strength: number;
  let description: string;
  
  if (choppiness > 0.6) {
    regime = 'choppy';
    strength = Math.round(choppiness * 100);
    description = `High reversals (${reversals}/${totalMoves}), avoid trading`;
  } else if (adx !== null && adx > 25 && efficiency > 0.5) {
    // Strong trend
    if (priceChange > 0) {
      regime = 'trending_up';
      strength = Math.min(100, Math.round(adx * 1.5));
      description = `ADX ${adx.toFixed(0)}, +${priceChange.toFixed(1)}% move, ${higherHighs} higher highs`;
    } else {
      regime = 'trending_down';
      strength = Math.min(100, Math.round(adx * 1.5));
      description = `ADX ${adx.toFixed(0)}, ${priceChange.toFixed(1)}% move, ${lowerLows} lower lows`;
    }
  } else if (range < 2 || (efficiency < 0.3 && choppiness < 0.4)) {
    regime = 'ranging';
    strength = Math.round((1 - efficiency) * 50);
    description = `Price in ${range.toFixed(1)}% range, mean reversion favorable`;
  } else if (trendConsistency > 0.5) {
    regime = priceChange > 0 ? 'trending_up' : 'trending_down';
    strength = Math.round(trendConsistency * 70);
    description = `Moderate trend, ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% move`;
  } else {
    regime = 'choppy';
    strength = Math.round(choppiness * 60);
    description = `Mixed signals, reduce position size`;
  }
  
  return { regime, strength, adx, description };
}
