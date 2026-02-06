import OpenAI from "openai";
import { calculateAllIndicators, type TechnicalIndicators } from "./indicators";
import { fetchFearGreedIndex, type FearGreedData } from "./fearGreedIndex";
import { 
  getMultiTimeframeAnalysis, 
  getVolumeData, 
  detectMarketRegime, 
  getPerformanceStats,
  calculateDynamicPositionSize,
  detectCandlePatterns,
  getSwingLevels,
  getLongerTermTrends,
  formatLongerTermTrends,
  getMultiTimeframePriceAction,
  type EnhancedMarketContext as EnhancedContext,
  type CandlePattern,
  type SwingLevels,
  type LongerTermTrends
} from "./marketAnalysis";
import { storage } from "./storage";
import { getRealTimePrice, analyzeOrderBook, getWebSocketStats } from "./krakenWebSocket";
import { calculateConfluence } from "./confluenceAnalysis";
import { generateEnsemblePerspectives } from "./ensembleAI";
import { analyzeForScalping, buildScalpingAIContext, getScalpingGateSettings, type ScalpingSettings, type ScalpingSignal } from "./scalpingAnalysis";

// Default OpenAI client - will be overridden when custom endpoint is used
let openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Custom AI endpoint configuration
let customAiConfig: { endpoint: string | null; model: string | null; useStructuredOutput: boolean } = {
  endpoint: null,
  model: null,
  useStructuredOutput: false,
};

// JSON Schema for single coin trading decisions (structured output mode)
const singleCoinResponseSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "trading_decision",
    strict: true,
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["buy", "sell", "hold"] },
        confidence: { type: "number" },
        tradeAmountPercent: { type: "number" },
        stopLossPercent: { type: "number" },
        takeProfitPercent: { type: "number" },
        maxDrawdownPercent: { type: "number" },
        riskLevel: { type: "string", enum: ["conservative", "moderate", "aggressive"] },
        strategy: { type: "string", enum: ["momentum", "mean_reversion", "dca", "grid_trading"] },
        marketCondition: { type: "string", enum: ["bullish", "bearish", "sideways", "volatile"] },
        urgency: { type: "number" },
        estimatedMinutesToTarget: { type: "number" },
        reasoning: { type: "string" }
      },
      required: ["action", "confidence", "tradeAmountPercent", "stopLossPercent", "takeProfitPercent", "maxDrawdownPercent", "riskLevel", "strategy", "marketCondition", "urgency", "reasoning"],
      additionalProperties: false
    }
  }
};

// JSON Schema for batch coin trading decisions (structured output mode)
const batchCoinResponseSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "batch_trading_decisions",
    strict: true,
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          action: { type: "string", enum: ["buy", "sell", "hold"] },
          confidence: { type: "number" },
          tradeAmountPercent: { type: "number" },
          stopLossPercent: { type: "number" },
          takeProfitPercent: { type: "number" },
          maxDrawdownPercent: { type: "number" },
          riskLevel: { type: "string", enum: ["conservative", "moderate", "aggressive"] },
          strategy: { type: "string", enum: ["momentum", "mean_reversion", "dca", "grid_trading"] },
          marketCondition: { type: "string", enum: ["bullish", "bearish", "sideways", "volatile"] },
          urgency: { type: "number" },
          estimatedMinutesToTarget: { type: "number" },
          reasoning: { type: "string" }
        },
        required: ["symbol", "action", "confidence", "tradeAmountPercent", "stopLossPercent", "takeProfitPercent", "maxDrawdownPercent", "riskLevel", "strategy", "marketCondition", "urgency", "reasoning"],
        additionalProperties: false
      }
    }
  }
};

// Create an OpenAI client with custom endpoint (for LM Studio, etc.)
// Per-request version - pass endpoint directly instead of using global config
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
    
    console.log(`[AI] Connecting to custom endpoint: ${normalizedEndpoint}`);
    return new OpenAI({
      baseURL: normalizedEndpoint,
      apiKey: "lm-studio", // LM Studio doesn't need a real API key
    });
  }
  console.log(`[AI] Using default OpenAI API`);
  return openai;
}

// Legacy function using global config - DEPRECATED, use getOpenAIClientWithConfig instead
function getOpenAIClient(): OpenAI {
  return getOpenAIClientWithConfig(customAiConfig.endpoint);
}

// Set custom AI endpoint for the trading bot
export function setCustomAiEndpoint(endpoint: string | null, model: string | null, useStructuredOutput?: boolean) {
  customAiConfig = { endpoint, model, useStructuredOutput: useStructuredOutput ?? false };
  if (endpoint) {
    console.log(`[AI] Custom AI endpoint configured: ${endpoint}${model ? ` (model: ${model})` : ''}${useStructuredOutput ? ' [Structured Output ENABLED]' : ''}`);
  } else {
    console.log(`[AI] Using default OpenAI API`);
  }
}

// Enable or disable structured output mode
export function setStructuredOutputMode(enabled: boolean) {
  customAiConfig.useStructuredOutput = enabled;
  console.log(`[AI] Structured output mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

// Get current custom AI configuration
export function getCustomAiConfig() {
  return { ...customAiConfig };
}

// Repair malformed JSON from small models
// Small models often produce invalid JSON with common issues:
// - Missing commas between properties
// - Unquoted property names
// - Missing closing braces
// - Extra text before/after JSON
function repairJSON(text: string): string {
  // First, extract just the JSON object
  let json = text;
  
  // Find the first { and last }
  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return '{}';
  }
  json = json.substring(start, end + 1);
  
  // Fix unquoted property names: action: -> "action":
  json = json.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // Fix missing commas between properties: "value" "nextProp" -> "value", "nextProp"
  json = json.replace(/"\s*\n\s*"/g, '",\n"');
  json = json.replace(/(\d)\s*\n\s*"/g, '$1,\n"');
  json = json.replace(/}\s*\n\s*"/g, '},\n"');
  
  // Fix missing commas after values followed by quotes: "value""next" -> "value","next"
  json = json.replace(/"(\s*)"(?=[a-zA-Z])/g, '",$1"');
  
  // Fix trailing commas before closing braces
  json = json.replace(/,\s*}/g, '}');
  json = json.replace(/,\s*]/g, ']');
  
  // Fix missing closing braces (count open vs close)
  const opens = (json.match(/{/g) || []).length;
  const closes = (json.match(/}/g) || []).length;
  if (opens > closes) {
    json += '}'.repeat(opens - closes);
  }
  
  return json;
}

// Try to parse JSON with repair for small models
function parseJSONWithRepair(text: string, isSmallModelResponse: boolean): any {
  // First try standard parsing
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Only attempt repair for small models
    if (!isSmallModelResponse) {
      throw e;
    }
    
    console.log(`[AUTO-PILOT] JSON parse failed, attempting repair for small model response`);
    
    // Try to repair the JSON
    const repaired = repairJSON(text);
    
    try {
      const result = JSON.parse(repaired);
      console.log(`[AUTO-PILOT] JSON repair successful`);
      return result;
    } catch (e2) {
      // If repair failed, try to extract key fields manually using regex
      console.log(`[AUTO-PILOT] JSON repair failed, attempting manual extraction`);
      
      // Extract action
      const actionMatch = text.match(/["']?action["']?\s*[:=]\s*["']?(buy|sell|hold)["']?/i);
      const action = actionMatch ? actionMatch[1].toLowerCase() : 'hold';
      
      // Extract confidence
      const confMatch = text.match(/["']?confidence["']?\s*[:=]\s*(\d+)/i);
      const confidence = confMatch ? parseInt(confMatch[1]) : 50;
      
      // Extract reasoning
      const reasonMatch = text.match(/["']?reasoning["']?\s*[:=]\s*["']([^"']+)["']?/i);
      const reasoning = reasonMatch ? reasonMatch[1] : 'Unable to parse AI response';
      
      // Extract trade amount percent
      const tradeMatch = text.match(/["']?tradeAmountPercent["']?\s*[:=]\s*(\d+)/i);
      const tradeAmountPercent = tradeMatch ? parseInt(tradeMatch[1]) : 5;
      
      // Extract urgency
      const urgencyMatch = text.match(/["']?urgency["']?\s*[:=]\s*(\d+)/i);
      const urgency = urgencyMatch ? parseInt(urgencyMatch[1]) : 5;
      
      console.log(`[AUTO-PILOT] Manual extraction: action=${action}, confidence=${confidence}`);
      
      return {
        action,
        confidence,
        reasoning,
        tradeAmountPercent,
        urgency,
        stopLoss: 3,
        takeProfit: 5,
        strategy: 'momentum'
      };
    }
  }
}

// Check if using custom AI endpoint (local model = unlimited compute)
function isUsingLocalAI(): boolean {
  return !!customAiConfig.endpoint;
}

// Check if using a small/lightweight model that needs simplified prompts
// Small models (<10B parameters) struggle with complex reasoning and confidence calibration
// Per-request version - pass model name directly
function isSmallModel(modelName: string | null | undefined, hasCustomEndpoint: boolean): boolean {
  if (!hasCustomEndpoint) return false;
  
  const normalizedName = (modelName || '').toLowerCase();
  
  // Detect small models by common naming patterns
  // Models under ~10B parameters typically have these indicators
  const smallModelPatterns = [
    'lfm', 'llama-1b', 'llama-3b', 'llama-7b',
    'phi-1', 'phi-2', 'phi-3',
    'qwen-0.5b', 'qwen-1b', 'qwen-1.5b', 'qwen-4b', 'qwen-7b',
    'gemma-2b', 'gemma-7b',
    'mistral-7b', 'ministral',
    'tinyllama', 'stablelm',
    '1b', '1.2b', '1.5b', '2b', '3b', '4b', '7b', '8b'
  ];
  
  // First check if it's a known LARGE model (10B+ parameters)
  // These models can handle complex prompts and reasoning
  const largeModelPatterns = [
    '10b', '12b', '13b', '14b', '15b', '20b', '22b', '24b', '27b', '30b', '32b', '34b', 
    '40b', '65b', '70b', '72b', '80b', '90b', '100b', '110b', '120b', '180b', '405b',
    'qwen3', 'qwen2.5-14b', 'qwen2.5-32b', 'qwen2.5-72b',
    'llama-3.1-70b', 'llama-3.1-405b', 'llama-70b',
    'mixtral', 'command-r', 'deepseek',
    'gpt-4', 'gpt-3.5', 'claude', 'gemini'
  ];
  
  for (const pattern of largeModelPatterns) {
    if (normalizedName.includes(pattern)) {
      console.log(`[AI] Detected large model (${normalizedName}) - using full prompts`);
      return false; // NOT a small model
    }
  }
  
  // Check if model name contains any small model pattern
  for (const pattern of smallModelPatterns) {
    if (normalizedName.includes(pattern)) {
      console.log(`[AI] Detected small model (${normalizedName}) - using simplified prompts`);
      return true;
    }
  }
  
  // Default: assume custom endpoint models are small unless proven otherwise
  // This is safer - better to use simple prompts than complex ones that confuse the model
  if (hasCustomEndpoint) {
    console.log(`[AI] Custom endpoint with unknown model (${normalizedName || 'unspecified'}) - using simplified prompts as fallback`);
    return true;
  }
  
  return false;
}

// Legacy function using global config - DEPRECATED
function isUsingSmallModel(): boolean {
  return isSmallModel(customAiConfig.model, !!customAiConfig.endpoint);
}

// Cache for Auto-Pilot decisions to reduce API usage (disabled for local AI)
const autoPilotCache = new Map<string, { decision: AutoPilotDecision; timestamp: number }>();
const AUTO_PILOT_CACHE_DURATION = 60 * 1000; // 60 seconds cache (only used for OpenAI)

// Simplified prompt builder for small models (<10B parameters)
// These models struggle with complex reasoning, so we provide explicit decision frameworks
function buildSmallModelPrompt(context: {
  symbol: string;
  currentPrice: number;
  priceChange: number;
  rsi: number | null;
  macdHistogram: number | null;
  recentTrend: 'UP' | 'DOWN' | 'FLAT';
  regime: string;
  fearGreedValue: number | null;
  hasPosition: boolean;
  positionPnL: number | null;
  isDayTradeMode: boolean;
  portfolioUSD: number;
}): string {
  const { symbol, currentPrice, priceChange, rsi, macdHistogram, recentTrend, 
          regime, fearGreedValue, hasPosition, positionPnL, isDayTradeMode, portfolioUSD } = context;
  
  // Pre-calculate signals to help the small model
  const rsiSignal = rsi !== null 
    ? (rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : rsi > 55 ? 'BULLISH' : rsi < 45 ? 'BEARISH' : 'NEUTRAL')
    : 'UNKNOWN';
  
  const macdSignal = macdHistogram !== null
    ? (macdHistogram > 0.001 ? 'BULLISH' : macdHistogram < -0.001 ? 'BEARISH' : 'NEUTRAL')
    : 'UNKNOWN';
  
  const trendSignal = recentTrend;
  
  // Count bullish vs bearish signals
  let bullishCount = 0;
  let bearishCount = 0;
  
  if (rsiSignal === 'BULLISH' || rsiSignal === 'OVERSOLD') bullishCount++;
  if (rsiSignal === 'BEARISH' || rsiSignal === 'OVERBOUGHT') bearishCount++;
  if (macdSignal === 'BULLISH') bullishCount++;
  if (macdSignal === 'BEARISH') bearishCount++;
  if (trendSignal === 'UP') bullishCount++;
  if (trendSignal === 'DOWN') bearishCount++;
  if (priceChange > 1) bullishCount++;
  if (priceChange < -1) bearishCount++;
  
  const signalSummary = bullishCount > bearishCount 
    ? `${bullishCount} BULLISH vs ${bearishCount} BEARISH signals`
    : bearishCount > bullishCount 
    ? `${bearishCount} BEARISH vs ${bullishCount} BULLISH signals`
    : `MIXED signals (${bullishCount} bullish, ${bearishCount} bearish)`;

  // Highlight strong 24h moves - this is THE key signal!
  const is24hStrong = Math.abs(priceChange) >= 5;
  const is24hMassive = Math.abs(priceChange) >= 8;
  const change24hEmphasis = is24hMassive 
    ? `*** MASSIVE ${priceChange > 0 ? 'PUMP' : 'DUMP'}: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% in 24h - THIS IS A BIG MOVE! ***`
    : is24hStrong
    ? `** STRONG ${priceChange > 0 ? 'GAIN' : 'DROP'}: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% in 24h **`
    : `24h Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`;

  return `TRADING DECISION for ${symbol}

MARKET DATA:
- Price: $${currentPrice.toFixed(6)}
- ${change24hEmphasis}
- Trend: ${recentTrend}
- RSI: ${rsi?.toFixed(0) || 'N/A'} (${rsiSignal})
- MACD: ${macdSignal}
- Market: ${regime.toUpperCase()}
${fearGreedValue ? `- Sentiment: ${fearGreedValue} (${fearGreedValue < 30 ? 'FEAR' : fearGreedValue > 70 ? 'GREED' : 'NEUTRAL'})` : ''}
${hasPosition ? `- Your Position P/L: ${positionPnL !== null ? (positionPnL > 0 ? '+' : '') + positionPnL.toFixed(2) + '%' : 'N/A'}` : '- No current position'}

${is24hMassive && priceChange > 0 && !hasPosition ? 'CRITICAL: This coin pumped hard today. Consider if there is still momentum to catch!' : ''}
${is24hMassive && priceChange < 0 && !hasPosition ? 'CRITICAL: This coin dumped hard today. Look for oversold bounce opportunities!' : ''}

SIGNAL ANALYSIS: ${signalSummary}

DECISION RULES:
${isDayTradeMode ? `Day Trading Mode - Be Active!` : `Swing Trading Mode - Be Selective!`}

CONFIDENCE GUIDE (PICK ONE):
- LOW (30-40): Signals conflict or unclear. ${isDayTradeMode ? 'Still tradeable.' : 'Skip trade.'}
- MEDIUM (50-60): Some signals align. ${isDayTradeMode ? 'Good trade.' : 'Consider trading.'}
- HIGH (70-80): Multiple strong signals align. Take this trade.
- VERY_HIGH (85-95): Extremely clear setup. Rare - only use if ALL signals agree strongly.

${hasPosition && positionPnL !== null ? 
  (positionPnL > 3 ? 'HINT: You are in profit. Consider SELL to lock gains.' : 
   positionPnL < -5 ? 'HINT: Position is losing. Consider SELL to cut loss.' : 
   'HINT: Position is near breakeven. HOLD or wait for clearer direction.') : ''}

${!hasPosition && bullishCount >= 3 ? 'HINT: Multiple bullish signals. Consider BUY.' : ''}
${!hasPosition && bearishCount >= 3 ? 'HINT: Multiple bearish signals. Wait or skip.' : ''}
${bullishCount === bearishCount ? 'HINT: Mixed signals. Consider HOLD.' : ''}

Respond with ONLY this JSON:
{
  "action": "buy" or "sell" or "hold",
  "confidence": <number from guide above>,
  "tradeAmountPercent": <5-15>,
  "stopLossPercent": <3-10>,
  "takeProfitPercent": <${isDayTradeMode ? '2-8' : '5-20'}>,
  "maxDrawdownPercent": 20,
  "riskLevel": "${isDayTradeMode ? 'aggressive' : 'moderate'}",
  "strategy": "momentum",
  "marketCondition": "${regime === 'trending_up' ? 'bullish' : regime === 'trending_down' ? 'bearish' : regime === 'ranging' ? 'sideways' : 'volatile'}",
  "urgency": <1-10>,
  "reasoning": "<1 sentence explaining your choice>"
}`;
}

// System prompt for small models - simpler and more direct
function getSmallModelSystemPrompt(isDayTradeMode: boolean): string {
  return isDayTradeMode
    ? "You are a crypto day trader. Decide: BUY, SELL, or HOLD. Be DECISIVE - if RSI<35 or RSI>65, you MUST pick BUY or SELL. Use full confidence range 20-90%, not just 40-50%. Respond with JSON only."
    : "You are a crypto swing trader. Decide: BUY, SELL, or HOLD. Be DECISIVE - if signals point a direction, choose it. Don't default to 'sideways' unless market is truly flat. Use full confidence range 20-90%. Respond with JSON only.";
}

export interface AutoPilotSettings {
  stopLossPercent: number;
  takeProfitPercent: number;
  maxDrawdownPercent: number;
  tradeAmountPercent: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  recommendedStrategy: 'momentum' | 'mean_reversion' | 'dca' | 'grid_trading';
  shouldTrade: boolean;
  reasoning: string;
  confidenceLevel: number;
  marketCondition: 'bullish' | 'bearish' | 'sideways' | 'volatile';
}

// Chain-of-Thought analysis scores from the AI
export interface ChainOfThoughtAnalysis {
  primaryScore?: number;       // Sum of trend/RSI/MACD/MA signals (-31 to +31)
  confirmationScore?: number;  // Sum of volume/BTC/sentiment/levels signals (-19 to +19)
  riskAdjustment?: number;     // Position/portfolio/regime adjustment (-10 to +10)
  finalScore?: number;         // Weighted total score
  conflictResolution?: string; // How signal conflicts were resolved
  premortem?: string;          // What could make this trade fail
  biasCheck?: string;          // Which biases were checked for
}

export interface AutoPilotDecision {
  action: 'buy' | 'sell' | 'hold';
  symbol: string;
  tradeAmountUSD: number;
  reasoning: string;
  confidence: number;
  urgency: number;
  strategyUsed: string;
  riskAdjustedSettings: AutoPilotSettings;
  positionSizeAdjusted?: boolean;
  regimeDetected?: string;
  timeToTargetMinutes?: number; // Estimated time to reach take profit target
  chainOfThought?: ChainOfThoughtAnalysis; // Detailed reasoning analysis from AI
}

// Calculate estimated time to reach take profit target
// Based on: volatility, momentum, distance to target, and historical price movement speed
// Can be called with either takeProfitPercent (full target) or remainingPercent (distance left)
export function calculateTimeToTarget(
  priceHistory: number[],
  currentPrice: number,
  takeProfitPercent: number,
  atr?: number,
  entryPrice?: number // If provided, calculates remaining distance instead of full target
): number {
  if (priceHistory.length < 10) {
    return 60; // Default 1 hour if not enough data
  }
  
  // Calculate remaining distance to target
  let remainingPercent = takeProfitPercent;
  if (entryPrice && entryPrice > 0 && currentPrice > 0) {
    const targetPrice = entryPrice * (1 + takeProfitPercent / 100);
    const currentPL = ((currentPrice - entryPrice) / entryPrice) * 100;
    remainingPercent = Math.max(0.1, takeProfitPercent - currentPL); // Minimum 0.1% remaining
  }
  
  // Calculate recent price movement speed (% change per interval)
  const recentPrices = priceHistory.slice(-30);
  let totalAbsChange = 0;
  for (let i = 1; i < recentPrices.length; i++) {
    totalAbsChange += Math.abs((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1] * 100);
  }
  const avgChangePerInterval = totalAbsChange / (recentPrices.length - 1);
  
  // Factor in ATR if available (volatility adjustment)
  let volatilityMultiplier = 1;
  if (atr && atr > 0 && currentPrice > 0) {
    const atrPercent = (atr / currentPrice) * 100;
    // Higher ATR = faster potential moves
    volatilityMultiplier = atrPercent > avgChangePerInterval ? 0.7 : 1.2;
  }
  
  // Assume 1-minute candles, so avgChangePerInterval is % per minute
  if (avgChangePerInterval <= 0) {
    return 480; // 8 hours default for no movement
  }
  
  // Adjust for momentum direction
  const recentMomentum = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100;
  const momentumBoost = recentMomentum > 0 ? 0.8 : 1.5; // Faster if moving in right direction
  
  // Time estimate = remaining distance / speed * momentum adjustment * volatility adjustment
  let estimatedMinutes = (remainingPercent / avgChangePerInterval) * momentumBoost * volatilityMultiplier;
  
  // Cap between 60 minutes (1 hour) minimum for more accurate predictions
  // and 72 hours (4320 minutes) maximum
  // Longer prediction windows = higher accuracy (easier to predict 4h moves than 5min moves)
  estimatedMinutes = Math.max(60, Math.min(4320, estimatedMinutes));
  
  return Math.round(estimatedMinutes);
}

export interface BTCContext {
  price: number;
  change24h: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  momentum: number;
  isBTCDumping: boolean;
}

export interface WinRateStats {
  winRate: number;
  avgProfitOnWins: number;
  avgLossOnLosses: number;
  totalTrades: number;
  consecutiveLosses: number;
  winningTrades: number;
  losingTrades: number;
}

export interface VolumeAnomalyResult {
  isAnomaly: boolean;
  volumeRatio: number;
  signal: 'high_volume' | 'low_volume' | 'normal';
}

export interface RSIDivergenceResult {
  hasDivergence: boolean;
  type: 'bullish' | 'bearish' | null;
  strength: number;
}

// Extended analytics types (Tasks 1-7)
export interface ETHContext {
  price: number;
  change24h: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  momentum: number;
  isETHDumping: boolean;
}

export interface TimeContext {
  hourUTC: number;
  dayOfWeek: string;
  marketSession: 'asia' | 'europe' | 'us' | 'overlap_asia_europe' | 'overlap_europe_us' | 'weekend';
  isWeekend: boolean;
  sessionDescription: string;
}

export interface SpreadAnalysis {
  spreadPercent: number;
  isWideSpread: boolean;
  bidDepthUSD: number;
  askDepthUSD: number;
  depthRatio: number;
  hasBidWalls: boolean;
  hasAskWalls: boolean;
  signal: 'strong_buy_pressure' | 'strong_sell_pressure' | 'balanced' | 'thin_liquidity';
}

export interface VolatilityContext {
  volatility15m: number;
  volatility1h: number;
  volatilityLevel: 'low' | 'medium' | 'high' | 'extreme';
  isVolatilitySpike: boolean;
  description: string;
}

export interface PositionAging {
  durationMinutes: number;
  durationHours: number;
  isStale: boolean;
  warning: string | null;
  recommendation: string;
}

export interface PortfolioHeat {
  totalInvestedUSD: number;
  availableUSD: number;
  heatPercent: number;
  positionCount: number;
  heatLevel: 'cold' | 'warm' | 'hot' | 'overheated';
  warning: string | null;
  canAddPosition: boolean;
}

export interface MarketContext {
  symbol: string;
  currentPrice: number;
  priceHistory: number[];
  indicators: TechnicalIndicators | null;
  fearGreed: FearGreedData | null;
  portfolioUSD: number;
  coinBalance: number;
  coinValueUSD: number;
  volume24h?: number;
  change24h?: number; // Real 24h change from Kraken ticker
  correlatedCoins?: { symbol: string; correlation: number }[];
  entryPrice?: number;
  entryTimestamp?: number;
  profitLossPercent?: number;
  timeInPosition?: number;
  recentTrades?: Array<{ type: 'buy' | 'sell'; price: number; symbol: string; timestamp: string; amount: string }>;
  btcContext?: BTCContext;
  winRateStats?: WinRateStats;
  volumeAnomaly?: VolumeAnomalyResult;
  rsiDivergence?: RSIDivergenceResult;
  // Extended analytics (Tasks 1-7)
  ethContext?: ETHContext;
  timeContext?: TimeContext;
  spreadAnalysis?: SpreadAnalysis;
  volatilityContext?: VolatilityContext;
  positionAging?: PositionAging;
  portfolioHeat?: PortfolioHeat;
  extendedAnalytics?: string;
  // Fee awareness
  feeInfo?: {
    takerFee: number;
    makerFee: number;
    roundTripFee: number;
  };
  // Trading mode settings
  enableQuickProfit?: boolean;
  quickProfitPercent?: number;
  // User ID for self-awareness stats
  userId?: string;
  // AI Self-Awareness toggle - disable to test if it affects confidence clustering
  enableSelfAwareness?: boolean;
  // Custom AI endpoint (per-request, not global)
  customAiEndpoint?: string | null;
  customAiModel?: string | null;
  // Structured output mode - uses JSON schema to speed up local LLM responses
  useStructuredOutput?: boolean;
  // Gate Thresholds - configurable safety gates
  confluenceThreshold?: number; // Default 60%
  orderBookBuyThreshold?: number; // Default 0.6
  orderBookSellThreshold?: number; // Default 1.6
  ensembleMinAgree?: number; // Default 2 of 3
  momentumThreshold?: number; // Default 8%
  // Scalping Mode Settings
  enableScalpingMode?: boolean;
  scalpingSettings?: {
    targetPercent: number;
    stopPercent: number;
    trailingPercent: number;
    timeoutMinutes: number;
    minSpread: number;
    volumeMultiplier: number;
    orderBookImbalance: number;
    emaFast: number;
    emaSlow: number;
    rsiOversold: number;
    rsiOverbought: number;
    bollingerPeriod: number;
    bollingerStd: number;
    useVwap: boolean;
    antiChopAtr: number;
  };
}

export async function analyzeMarketForAutoPilot(context: MarketContext): Promise<AutoPilotDecision> {
  const { 
    symbol, currentPrice, priceHistory, indicators, fearGreed, 
    portfolioUSD, coinBalance, coinValueUSD, volume24h, change24h, correlatedCoins, 
    btcContext, winRateStats, volumeAnomaly, rsiDivergence,
    ethContext, timeContext, spreadAnalysis, volatilityContext, 
    positionAging, portfolioHeat, extendedAnalytics, feeInfo,
    enableQuickProfit, quickProfitPercent, userId,
    customAiEndpoint, customAiModel, useStructuredOutput,
    confluenceThreshold = 60,
    orderBookBuyThreshold = 0.6,
    orderBookSellThreshold = 1.6,
    ensembleMinAgree = 2,
    momentumThreshold = 8,
    enableScalpingMode,
    scalpingSettings
  } = context;
  
  // === SCALPING MODE: Override gates and use short-timeframe analysis ===
  let effectiveConfluenceThreshold = confluenceThreshold;
  let effectiveOrderBookBuyThreshold = orderBookBuyThreshold;
  let effectiveOrderBookSellThreshold = orderBookSellThreshold;
  let effectiveEnsembleMinAgree = ensembleMinAgree;
  let effectiveMomentumThreshold = momentumThreshold;
  let scalpingSignal: ScalpingSignal | null = null;
  let scalpingContext: string = '';
  
  if (enableScalpingMode && scalpingSettings) {
    // Apply aggressive scalping gate settings
    const scalpingGates = getScalpingGateSettings();
    effectiveConfluenceThreshold = scalpingGates.confluenceThreshold;
    effectiveOrderBookBuyThreshold = scalpingGates.orderBookBuyThreshold;
    effectiveOrderBookSellThreshold = scalpingGates.orderBookSellThreshold;
    effectiveEnsembleMinAgree = scalpingGates.ensembleMinAgree;
    effectiveMomentumThreshold = scalpingGates.momentumThreshold;
    
    // Get order book imbalance for scalping analysis
    const orderBook = analyzeOrderBook(symbol);
    const orderBookImbalance = orderBook?.imbalanceRatio || 1;
    const spreadPercent = spreadAnalysis?.spreadPercent || 0;
    
    // Run scalping-specific analysis
    scalpingSignal = analyzeForScalping(
      symbol,
      currentPrice,
      scalpingSettings,
      orderBookImbalance,
      spreadPercent
    );
    
    // Build scalping AI context
    scalpingContext = buildScalpingAIContext(symbol, scalpingSignal, scalpingSettings);
    
    console.log(`[SCALPING] ${symbol}: ${scalpingSignal.action.toUpperCase()} (${scalpingSignal.confidence}%) - ${scalpingSignal.reasoning}`);
  }
  
  // Use real 24h change from Kraken if available, fall back to price history calculation
  const real24hChange = change24h ?? (priceHistory.length >= 2 ? ((currentPrice - priceHistory[0]) / priceHistory[0] * 100) : 0);
  
  // Debug: Log the 24h change being used for ALL coins
  console.log(`[24H-CHANGE] ${symbol}: change24h=${change24h}, real24hChange=${real24hChange.toFixed(2)}% (${change24h !== undefined ? 'REAL Kraken' : 'calculated'})${Math.abs(real24hChange) >= momentumThreshold ? ' 🚀 MASSIVE' : Math.abs(real24hChange) >= 5 ? ' 📈 STRONG' : ''}`);
  
  
  // Log active gate thresholds for the first coin each cycle (avoids spam)
  if (symbol === 'ETH' || symbol === 'BTC') {
    if (enableScalpingMode) {
      console.log(`[SCALPING MODE] Active thresholds: Confluence=${effectiveConfluenceThreshold}%, OrderBook Buy=${effectiveOrderBookBuyThreshold}x, Sell=${effectiveOrderBookSellThreshold}x, Ensemble=${effectiveEnsembleMinAgree}/3, Momentum=${effectiveMomentumThreshold}%`);
    } else {
      console.log(`[GATE SETTINGS] Active thresholds: Confluence=${confluenceThreshold}%, OrderBook Buy=${orderBookBuyThreshold}x, Sell=${orderBookSellThreshold}x, Ensemble=${ensembleMinAgree}/3, Momentum=${momentumThreshold}%`);
    }
  }
  
  // Update structured output mode from context (per-request setting)
  if (useStructuredOutput !== undefined) {
    customAiConfig.useStructuredOutput = useStructuredOutput;
  }
  
  // Determine trading style based on user settings
  const isDayTradeMode = enableQuickProfit === true;
  const targetProfitPercent = quickProfitPercent || 1.0;
  
  // Check cache first to reduce API calls (skip cache for local AI - unlimited compute)
  const cacheKey = symbol;
  // Use per-request custom endpoint instead of global (fixes multi-user bug)
  const usingLocalAI = !!customAiEndpoint;
  
  if (!usingLocalAI) {
    const cached = autoPilotCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < AUTO_PILOT_CACHE_DURATION) {
      console.log(`[AUTO-PILOT] Using cached decision for ${symbol} (${Math.round((AUTO_PILOT_CACHE_DURATION - (Date.now() - cached.timestamp)) / 1000)}s remaining)`);
      return cached.decision;
    }
  } else {
    console.log(`[AUTO-PILOT] Local AI detected - fresh analysis every cycle for ${symbol}`);
  }
  
  const totalPortfolioValue = portfolioUSD + coinValueUSD;
  const coinAllocationPercent = totalPortfolioValue > 0 ? (coinValueUSD / totalPortfolioValue) * 100 : 0;
  
  // Get enhanced market analysis data
  const multiTimeframe = getMultiTimeframeAnalysis(symbol);
  const volumeData = getVolumeData(symbol);
  const regime = detectMarketRegime(symbol, priceHistory);
  const performance = getPerformanceStats(symbol);
  const longerTermTrends = getLongerTermTrends(symbol);
  
  // Get AI self-awareness stats (prediction accuracy)
  let selfAwareness: Awaited<ReturnType<typeof storage.getAiSelfAwareness>> | null = null;
  if (userId) {
    try {
      selfAwareness = await storage.getAiSelfAwareness(userId, symbol);
    } catch (e) {
      console.log(`[AUTO-PILOT] Could not fetch self-awareness stats: ${e}`);
    }
  }
  
  // Build multi-timeframe section
  const timeframeSection = multiTimeframe ? `
MULTI-TIMEFRAME ANALYSIS:
- Alignment: ${multiTimeframe.alignment.replace('_', ' ').toUpperCase()} (score: ${multiTimeframe.alignmentScore})
- Recommendation: ${multiTimeframe.recommendation}
${multiTimeframe.trends.map(t => `- ${t.timeframe.toUpperCase()} Trend: ${t.trend} (strength: ${t.strength.toFixed(0)}, change: ${t.priceChange.toFixed(2)}%)`).join('\n')}
` : '';

  // Build volume section
  const volumeSection = volumeData || volume24h ? `
VOLUME ANALYSIS:
- 24h Volume: $${(volume24h || volumeData?.volume24h || 0).toLocaleString()}
- Volume Trend: ${volumeData?.volumeTrend || 'unknown'} (${volumeData?.volumeChange?.toFixed(1) || 0}% vs avg)
- Volume Signal: ${volumeData?.volumeTrend === 'increasing' ? 'CONFIRMING - High volume supports trend' : volumeData?.volumeTrend === 'decreasing' ? 'WEAK - Low volume may indicate false moves' : 'NEUTRAL'}
` : '';

  // Build market regime section
  const regimeSection = `
MARKET REGIME DETECTION:
- Current Regime: ${regime.regime.replace('_', ' ').toUpperCase()}
- Regime Strength: ${regime.strength.toFixed(0)}% (confidence: ${regime.confidence.toFixed(0)}%)
- Regime Insight: ${regime.description}
- Strategy Recommendation: ${regime.regime === 'trending_up' || regime.regime === 'trending_down' ? 'MOMENTUM strategies favored' : regime.regime === 'ranging' ? 'MEAN REVERSION strategies favored' : 'GRID TRADING or DCA strategies safer'}
`;

  // Build performance learning section
  const performanceSection = performance.totalTrades > 0 ? `
HISTORICAL PERFORMANCE (Learning from past trades):
- Total Trades: ${performance.totalTrades}
- Win Rate: ${performance.winRate.toFixed(1)}%
- Avg Profit: +${performance.avgProfitPercent.toFixed(2)}% | Avg Loss: -${performance.avgLossPercent.toFixed(2)}%
- Best Performing Strategy: ${performance.bestStrategy || 'Not enough data'}
- Recent Performance: ${performance.recentPerformance.toUpperCase()}
${Object.keys(performance.strategyWinRates).length > 0 ? `- Strategy Win Rates: ${Object.entries(performance.strategyWinRates).map(([s, r]) => `${s}: ${r.toFixed(0)}%`).join(', ')}` : ''}
` : `
HISTORICAL PERFORMANCE:
- No trade history available yet - build track record
`;

  // Build correlation section
  const correlationSection = correlatedCoins && correlatedCoins.length > 0 ? `
CORRELATION AWARENESS:
${correlatedCoins.map(c => `- ${c.symbol}: ${c.correlation > 0.7 ? 'HIGHLY CORRELATED' : c.correlation > 0.4 ? 'Moderately correlated' : c.correlation < -0.4 ? 'Inversely correlated' : 'Low correlation'} (${(c.correlation * 100).toFixed(0)}%)`).join('\n')}
- Diversification Tip: ${correlatedCoins.some(c => c.correlation > 0.7) ? 'Avoid overexposure to highly correlated assets' : 'Good diversification opportunity'}
` : '';

  // Build position status section
  const { entryPrice, entryTimestamp, profitLossPercent, timeInPosition, recentTrades } = context;
  const quickProfitTarget = entryPrice ? entryPrice * (1 + targetProfitPercent / 100) : 0;
  const stopLossTarget = entryPrice ? entryPrice * 0.98 : 0;
  
  const positionStatusSection = entryPrice && entryPrice > 0 ? `
POSITION STATUS:
- Entry Price: $${entryPrice.toFixed(6)}
- Current P/L: ${profitLossPercent !== undefined ? (profitLossPercent >= 0 ? `+${profitLossPercent.toFixed(2)}%` : `${profitLossPercent.toFixed(2)}%`) : 'N/A'}
- Time in Position: ${timeInPosition !== undefined ? `${timeInPosition}m` : 'N/A'}
${isDayTradeMode ? `- Quick Profit Target: +${targetProfitPercent}% ($${quickProfitTarget.toFixed(6)})` : `- Take Profit Target: Wait for larger gains (5-10%+)`}
- Stop Loss: -2% ($${stopLossTarget.toFixed(6)})
` : `
POSITION STATUS:
- No position (0 holdings)
`;

  // Build recent trades section
  const recentTradesSection = recentTrades && recentTrades.length > 0 ? `
RECENT TRADES (last ${Math.min(5, recentTrades.length)}):
${recentTrades.slice(0, 5).map(t => {
  const tradeTime = new Date(t.timestamp);
  const minsAgo = Math.floor((Date.now() - tradeTime.getTime()) / 60000);
  return `- ${t.type.toUpperCase()} ${t.symbol} @ $${t.price.toFixed(6)} (${minsAgo}m ago)`;
}).join('\n')}
` : '';

  // Build swing levels section
  const swingLevels = getSwingLevels(symbol);
  const swingLevelsSection = swingLevels ? `
PRICE LEVELS:
- Recent High: $${swingLevels.recentHigh.toFixed(6)} (${swingLevels.distanceToHigh.toFixed(2)}% away)
- Recent Low: $${swingLevels.recentLow.toFixed(6)} (${swingLevels.distanceToLow.toFixed(2)}% away)
- Timeframe: ${swingLevels.timeframe}
` : '';

  // Build candle patterns section
  const candlePatterns = detectCandlePatterns(symbol);
  const significantPatterns = candlePatterns.filter(p => p.pattern !== 'none');
  const candlePatternsSection = significantPatterns.length > 0 ? `
CANDLE PATTERNS:
${significantPatterns.map(p => `- ${p.timeframe.toUpperCase()}: ${p.pattern.replace('_', ' ').toUpperCase()} (strength: ${p.strength.toFixed(0)}%)`).join('\n')}
` : '';

  // Build CHART PRICE ACTION section - visual chart-like description for AI
  const priceActionContext = getMultiTimeframePriceAction(symbol);
  const priceActionSection = priceActionContext ? `
${priceActionContext}
` : '';
  
  if (priceActionContext) {
    console.log(`[PRICE ACTION] ${symbol}: Chart context added to AI prompt`);
  }

  // Build BTC Market Context section
  const btcContextSection = btcContext ? `
=== BTC MARKET CONTEXT ===
BTC Price: $${btcContext.price.toLocaleString()}
BTC Trend: ${btcContext.trend.toUpperCase()} (momentum: ${btcContext.momentum > 0 ? '+' : ''}${btcContext.momentum})
BTC Dumping: ${btcContext.isBTCDumping ? 'YES - CAUTION: Consider reducing exposure or waiting' : 'No'}
${btcContext.isBTCDumping ? '⚠️ BTC is dropping significantly - altcoins often follow BTC down' : ''}
` : '';

  // Build Trading Performance section
  const winRateSection = winRateStats && winRateStats.totalTrades > 0 ? `
=== YOUR TRADING PERFORMANCE ===
Win Rate: ${winRateStats.winRate.toFixed(1)}%
Avg Profit on Wins: +${winRateStats.avgProfitOnWins.toFixed(2)}%
Avg Loss on Losses: -${winRateStats.avgLossOnLosses.toFixed(2)}%
Total Trades: ${winRateStats.totalTrades} (${winRateStats.winningTrades} wins, ${winRateStats.losingTrades} losses)
Consecutive Losses: ${winRateStats.consecutiveLosses}
${winRateStats.consecutiveLosses >= 3 ? '⚠️ WARNING: 3+ consecutive losses - consider reducing position size or pausing this coin' : ''}
${winRateStats.winRate < 40 ? '⚠️ Low win rate - review strategy or be more selective' : winRateStats.winRate > 60 ? '✅ Strong win rate - strategy is working well' : ''}
` : `
=== YOUR TRADING PERFORMANCE ===
No completed trades yet for ${symbol} - building track record
`;

  // Build Volume Anomaly section
  const volumeAnomalySection = volumeAnomaly ? `
=== VOLUME ANALYSIS ===
Volume Status: ${volumeAnomaly.signal.replace('_', ' ').toUpperCase()}
Volume Ratio: ${volumeAnomaly.volumeRatio.toFixed(2)}x average
${volumeAnomaly.isAnomaly && volumeAnomaly.signal === 'high_volume' ? '🔥 ALERT: Unusual high volume detected - potential breakout or major move incoming' : ''}
${volumeAnomaly.isAnomaly && volumeAnomaly.signal === 'low_volume' ? '⚠️ Low volume warning - moves may be unreliable, wait for confirmation' : ''}
${!volumeAnomaly.isAnomaly ? 'Volume is normal - standard trading conditions' : ''}
` : '';

  // Build RSI Divergence section
  const rsiDivergenceSection = rsiDivergence ? `
=== RSI DIVERGENCE ===
${rsiDivergence.hasDivergence ? `${rsiDivergence.type?.toUpperCase()} DIVERGENCE detected (strength: ${rsiDivergence.strength}%)` : 'No divergence detected'}
${rsiDivergence.type === 'bearish' ? '⚠️ WARNING: Bearish divergence - price may reverse downward soon' : ''}
${rsiDivergence.type === 'bullish' ? '✅ OPPORTUNITY: Bullish divergence - price may reverse upward soon' : ''}
` : '';

  // Build Extended Analytics section (Tasks 1-7)
  const extendedAnalyticsSection = extendedAnalytics ? `
${extendedAnalytics}
` : '';

  // Build Longer-Term Trends section (7-day, 30-day, 90-day trends)
  const longerTermTrendsSection = formatLongerTermTrends(longerTermTrends);
  
  // Build AI self-awareness section (prediction accuracy feedback)
  // Can be disabled via settings to test if it affects confidence clustering
  const enableSelfAwareness = context.enableSelfAwareness !== false; // Default true if not specified
  let selfAwarenessSection = '';
  if (enableSelfAwareness && selfAwareness && selfAwareness.overallAccuracy > 0) {
    const { overallAccuracy, symbolAccuracy, symbolPredictions, bullishBias, bearishBias, flatMisses, recentWrong } = selfAwareness;
    selfAwarenessSection = `
=== YOUR PREDICTION ACCURACY (LEARN FROM YOUR MISTAKES) ===
Overall Accuracy: ${overallAccuracy.toFixed(1)}%
${symbolAccuracy !== null ? `${symbol} Accuracy: ${symbolAccuracy.toFixed(1)}% (${symbolPredictions} predictions)` : `${symbol}: Not enough data yet`}

BIAS ANALYSIS - ADJUST YOUR THINKING:
- Bullish calls (UP): ${bullishBias.upAccuracy.toFixed(1)}% accurate (${bullishBias.upCorrect}/${bullishBias.upCalls} correct)
- Bearish calls (DOWN): ${bearishBias.downAccuracy.toFixed(1)}% accurate (${bearishBias.downCorrect}/${bearishBias.downCalls} correct)
- Times you predicted movement but market was FLAT: ${flatMisses} times

CRITICAL LEARNINGS FROM YOUR ERRORS:
${bullishBias.upAccuracy < 40 ? 'WARNING: Your UP calls are often wrong. Be more skeptical of bullish signals!' : ''}
${bearishBias.downAccuracy < 40 ? 'WARNING: Your DOWN calls are often wrong. Markets trend up more than you expect!' : ''}
${flatMisses > 20 ? 'WARNING: You predict movement when markets go SIDEWAYS. Watch for low volatility/range-bound conditions!' : ''}
${flatMisses > 20 ? '- FLAT MARKET DETECTION: If volatility is low, spread is tight, and no clear catalyst exists, consider HOLD instead of predicting movement.' : ''}

${recentWrong.length > 0 ? `Recent ${symbol} mistakes: ${recentWrong.map(w => `predicted ${w.predicted.toUpperCase()} (${w.confidence}% conf) → actually ${w.actual.toUpperCase()}`).join(', ')}` : ''}
`;
  }
  
  // === CUTTING-EDGE ANALYSIS SECTIONS ===
  
  // WebSocket Real-Time Price
  const wsPrice = getRealTimePrice(symbol);
  const wsStats = getWebSocketStats();
  const realtimePriceSection = wsPrice ? `
=== REAL-TIME PRICE (WebSocket) ===
Price: $${wsPrice.price.toFixed(6)} (${wsStats.connected ? 'LIVE' : 'DELAYED'})
Bid: $${wsPrice.bid.toFixed(6)} | Ask: $${wsPrice.ask.toFixed(6)}
Spread: $${(wsPrice.ask - wsPrice.bid).toFixed(6)} (${((wsPrice.ask - wsPrice.bid) / wsPrice.bid * 100).toFixed(3)}%)
${wsPrice.volume24h ? `24h Volume: $${wsPrice.volume24h.toLocaleString()}` : ''}
Latency: ${Date.now() - wsPrice.timestamp}ms
` : '';

  // Order Book Depth Analysis
  const orderBook = analyzeOrderBook(symbol);
  const orderBookSection = orderBook ? `
=== ORDER BOOK DEPTH ANALYSIS ===
Signal: ${orderBook.signal.toUpperCase().replace('_', ' ')}
Imbalance Ratio: ${orderBook.imbalanceRatio.toFixed(2)}x (${orderBook.imbalanceRatio > 1.2 ? 'BUYERS DOMINANT' : orderBook.imbalanceRatio < 0.8 ? 'SELLERS DOMINANT' : 'BALANCED'})
Buy Pressure: $${orderBook.buyPressure.toLocaleString()} | Sell Pressure: $${orderBook.sellPressure.toLocaleString()}
Spread: ${orderBook.spreadPercent.toFixed(3)}%
${orderBook.bidWallPrice ? `BID WALL: $${orderBook.bidWallPrice.toFixed(6)} (${orderBook.bidWallVolume.toLocaleString()} USD support)` : ''}
${orderBook.askWallPrice ? `ASK WALL: $${orderBook.askWallPrice.toFixed(6)} (${orderBook.askWallVolume.toLocaleString()} USD resistance)` : ''}
Depth (10%): $${orderBook.depth10Percent.toLocaleString()}
${orderBook.signal === 'strong_buy' ? '🟢 HEAVY BUYING PRESSURE - Large buyers accumulating' : ''}
${orderBook.signal === 'strong_sell' ? '🔴 HEAVY SELLING PRESSURE - Large sellers distributing' : ''}
` : '';

  // Multi-Timeframe Confluence Analysis
  const confluence = calculateConfluence(symbol);
  const confluenceSection = `
=== MULTI-TIMEFRAME CONFLUENCE ===
Overall Signal: ${confluence.overallSignal.toUpperCase().replace('_', ' ')}
Confluence Score: ${confluence.confluenceScore}% (${confluence.alignment})
Should Trade: ${confluence.shouldTrade ? 'YES - Timeframes aligned' : 'NO - Conflicting signals'}
Recommendation: ${confluence.recommendation}

Timeframe Breakdown:
${confluence.timeframes.map(tf => {
  const signalEmoji = tf.signal === 'bullish' ? '🟢' : 
                      tf.signal === 'bearish' ? '🔴' : '⚪';
  return `- ${tf.timeframe.toUpperCase()}: ${signalEmoji} ${tf.signal.toUpperCase()} (strength: ${tf.strength.toFixed(0)}%, RSI: ${tf.rsi?.toFixed(0) || 'N/A'})`;
}).join('\n')}

${confluence.confluenceScore >= 80 ? '✅ HIGH CONFLUENCE: Strong agreement across timeframes - high probability setup' : ''}
${confluence.confluenceScore < 40 ? '⚠️ LOW CONFLUENCE: Timeframes disagree - higher risk trade' : ''}
${!confluence.shouldTrade ? '🚫 CONFLUENCE GATE: Insufficient alignment - consider HOLD' : ''}
`;

  // Ensemble AI Perspectives - multiple viewpoints for better decision making
  const volatilityForEnsemble = priceHistory.length >= 20 
    ? ((Math.max(...priceHistory.slice(-20)) - Math.min(...priceHistory.slice(-20))) / Math.min(...priceHistory.slice(-20)) * 100)
    : 0;
  const ensemblePerspectives = generateEnsemblePerspectives(symbol, {
    price: currentPrice,
    change24h: real24hChange, // Use REAL 24h change from Kraken!
    volatility: volatilityForEnsemble,
    volume: volume24h || 0,
    rsi: indicators?.rsi ?? undefined,
    macd: indicators?.macdHistogram ? { histogram: indicators.macdHistogram } : undefined,
    trendDirection: regime.regime.includes('up') ? 'up' : regime.regime.includes('down') ? 'down' : 'sideways'
  });
  
  const ensembleSection = `
=== ENSEMBLE MULTI-PERSPECTIVE ANALYSIS ===
Consider these THREE different trading perspectives before making your decision:

1. MOMENTUM TRADER PERSPECTIVE:
${ensemblePerspectives[0]}

2. MEAN REVERSION TRADER PERSPECTIVE:
${ensemblePerspectives[1]}

3. RISK MANAGER PERSPECTIVE:
${ensemblePerspectives[2]}

ENSEMBLE VOTING RULE: Only take action if at least 2 of 3 perspectives agree.
- If momentum and mean reversion both suggest BUY → Strong BUY signal
- If momentum and mean reversion conflict → Need risk manager as tiebreaker
- If risk manager says HOLD → Be conservative, reduce position size or skip

Think through each perspective before your final decision. Which perspectives agree? Which conflict?
`;

  // Determine if we're in position management mode (already holding coins)
  const isInPositionMode = coinBalance > 0 && entryPrice && entryPrice > 0;
  const currentPnL = isInPositionMode ? ((currentPrice - entryPrice!) / entryPrice!) * 100 : 0;
  
  // Position Management Mode - Different prompt when already holding a position
  const positionManagementPrompt = isInPositionMode ? `
===== POSITION MANAGEMENT MODE =====
You are ALREADY holding ${coinBalance.toFixed(4)} ${symbol} (worth $${coinValueUSD.toFixed(2)}).
Your job is to MANAGE THIS POSITION - decide whether to SELL or HOLD.
DO NOT recommend BUY - you already own this coin!

CURRENT POSITION:
- Entry Price: $${entryPrice!.toFixed(6)}
- Current Price: $${currentPrice.toFixed(6)}
- Unrealized P/L: ${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}%
- Time in Position: ${timeInPosition !== undefined ? `${timeInPosition} minutes` : 'Unknown'}
${isDayTradeMode 
  ? `- Quick Profit Target: +${targetProfitPercent}% ($${(entryPrice! * (1 + targetProfitPercent / 100)).toFixed(6)})`
  : `- Take Profit Target: +5-20% ($${(entryPrice! * 1.05).toFixed(6)} to $${(entryPrice! * 1.20).toFixed(6)})`}
- Stop Loss: -2% ($${(entryPrice! * 0.98).toFixed(6)})

POSITION MANAGEMENT DECISION FRAMEWORK:
${isDayTradeMode ? `
DAY TRADE EXIT RULES:
1. TAKE PROFIT: If P/L >= +${targetProfitPercent}% → SELL NOW (lock in gains!)
2. STOP LOSS: If P/L <= -2% → SELL NOW (cut your losses!)
3. TRAILING STOP: If you were up +2%+ but now falling back → Consider SELL before gains evaporate
4. HOLD: If P/L is positive but under target and momentum still up → HOLD and let it run
5. HOLD: If P/L is slightly negative (-1% to 0%) and no breakdown → HOLD for recovery
` : `
SWING TRADE EXIT RULES:
1. TAKE PROFIT: If P/L >= +5% and momentum weakening → Consider partial SELL
2. LET WINNERS RUN: If P/L is positive and trend intact → HOLD for bigger gains
3. STOP LOSS: If P/L <= -5% or trend broken → SELL to protect capital
4. HOLD: If consolidating with intact support → HOLD and wait
5. ADD (via separate BUY): Only if this trade is working AND you want more exposure
`}
===== END POSITION MANAGEMENT MODE =====

` : '';

  // Trading style prompt based on user settings
  const tradingStylePrompt = isDayTradeMode 
    ? (isInPositionMode 
      ? `You are an aggressive DAY TRADER AI currently MANAGING AN ACTIVE POSITION in ${symbol}.
Your focus is on EXITING THIS TRADE at the right time - either for profit or to cut losses.
Do NOT look for new buy opportunities. Your decision is: SELL to exit, or HOLD to continue managing.`
      : `You are an aggressive DAY TRADER AI. Your strategy is ACTIVE trading - you buy and sell frequently throughout the day to capture gains. Sitting on the sidelines is NOT your style. You'd rather make 10 quality trades than wait for 1 big one.

CRITICAL DAY TRADING RULES:
- You are a DAY TRADER. You do NOT hold positions for long periods.
- Your goal is to make quick profits. A ${targetProfitPercent}% gain is a WIN - take it!
- MINIMUM 1% profit target ensures trades are profitable after fees (~0.5% round-trip).
- NEVER let a winning trade turn into a losing trade. Protect profits aggressively.
- 55%+ confidence = TRADE. Below 55% = HOLD and wait for better setup.
- Require volatility > 0.3% to trade - avoid choppy sideways markets.`)
    : (isInPositionMode
      ? `You are a SWING TRADER AI currently MANAGING AN ACTIVE POSITION in ${symbol}.
Your focus is on determining if this position should continue or if it's time to exit.
Let winners run but don't let winning trades turn into losers. Your decision is: SELL to exit, or HOLD to continue holding.`
      : `You are a SWING TRADER AI. Your strategy is patient position trading - you wait for high-probability setups and hold positions for larger gains. Quality over quantity is your approach.

CRITICAL SWING TRADING RULES:
- You are a SWING TRADER. You hold positions for meaningful moves (5-20%+ gains).
- Your goal is to capture substantial price swings. Don't exit for small 0.5-1% gains.
- Wait for high-probability setups. Patience is more profitable than overtrading.
- Let winners run - don't cut profits short. Use trailing stops instead.
- Bias toward QUALITY entries. Better to miss trades than take bad ones.
- Require 60%+ confidence before entering. Don't trade marginal setups.`);
  
  const prompt = `${tradingStylePrompt}
${positionManagementPrompt}
You have FULL CONTROL over all trading decisions and settings.
You have access to ENHANCED analysis including multi-timeframe trends, volume confirmation, market regime detection, and learning from past trades.

CURRENT MARKET DATA for ${symbol}:
- Current Price: $${currentPrice.toFixed(6)}
- 24h Price Range: ${priceHistory.length > 0 ? `$${Math.min(...priceHistory).toFixed(6)} - $${Math.max(...priceHistory).toFixed(6)}` : 'N/A'}
${Math.abs(real24hChange) >= momentumThreshold 
  ? `*** MASSIVE ${real24hChange > 0 ? 'PUMP' : 'DUMP'}: ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(2)}% in 24h - THIS IS A BIG MOVE! ***`
  : Math.abs(real24hChange) >= 5
  ? `** STRONG ${real24hChange > 0 ? 'GAIN' : 'DROP'}: ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(2)}% in 24h **`
  : `- 24h Change: ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(2)}%`}
${Math.abs(real24hChange) >= momentumThreshold && real24hChange > 0 
  ? (isInPositionMode 
    ? `>>> CRITICAL: This coin PUMPED +${real24hChange.toFixed(1)}% today - STRONG bullish momentum! You're already in this position - consider HOLDING to ride the momentum or SELL if hitting your target. <<<`
    : `>>> CRITICAL: This coin PUMPED +${real24hChange.toFixed(1)}% today - STRONG bullish momentum! WEIGHT THIS HEAVILY in your decision. Short-term noise should not override daily strength. Look to BUY unless there are extreme overbought conditions! <<<`)
  : ''}
${Math.abs(real24hChange) >= momentumThreshold && real24hChange < 0 
  ? (isInPositionMode
    ? `>>> CRITICAL: This coin DUMPED ${real24hChange.toFixed(1)}% today - CAUTION! Evaluate if you should SELL to cut losses or HOLD if you see recovery signals. <<<`
    : `>>> CRITICAL: This coin DUMPED ${real24hChange.toFixed(1)}% today. Look for oversold bounce opportunities! <<<`)
  : ''}
${Math.abs(real24hChange) >= 5 && real24hChange > 0 && Math.abs(real24hChange) < momentumThreshold 
  ? (isInPositionMode
    ? `>>> NOTE: This coin is UP ${real24hChange.toFixed(1)}% today - momentum is on your side. Consider HOLDING your position. <<<`
    : `>>> NOTE: This coin is UP ${real24hChange.toFixed(1)}% today - bullish bias. Consider buying on dips. <<<`)
  : ''}
${usingLocalAI && priceHistory.length > 10 ? `
RECENT PRICE ACTION (last ${Math.min(20, priceHistory.length)} data points):
${priceHistory.slice(-20).map((p, i) => `  [${i + 1}] $${p.toFixed(6)}`).join('\n')}
- Recent Trend: ${priceHistory.length >= 5 ? (priceHistory[priceHistory.length - 1] > priceHistory[priceHistory.length - 5] ? 'UP' : 'DOWN') : 'N/A'}
- Volatility (last 20): ${priceHistory.length >= 10 ? ((Math.max(...priceHistory.slice(-20)) - Math.min(...priceHistory.slice(-20))) / Math.min(...priceHistory.slice(-20)) * 100).toFixed(2) : '0'}%
` : ''}

TECHNICAL INDICATORS:
${indicators ? `
- RSI (14): ${indicators.rsi?.toFixed(2) || 'N/A'} ${indicators.rsi ? (indicators.rsi > 70 ? '(OVERBOUGHT)' : indicators.rsi < 30 ? '(OVERSOLD)' : '(NEUTRAL)') : ''}
- MACD: ${indicators.macd?.toFixed(6) || 'N/A'}
- MACD Signal: ${indicators.macdSignal?.toFixed(6) || 'N/A'}
- MACD Histogram: ${indicators.macdHistogram?.toFixed(6) || 'N/A'} ${indicators.macdHistogram ? (indicators.macdHistogram > 0 ? '(BULLISH)' : '(BEARISH)') : ''}
- SMA 20: $${indicators.sma20?.toFixed(6) || 'N/A'} ${indicators.sma20 ? (currentPrice > indicators.sma20 ? '(Above - Bullish)' : '(Below - Bearish)') : ''}
- SMA 50: $${indicators.sma50?.toFixed(6) || 'N/A'}
- EMA 5/20 Micro-Trend: ${indicators.microTrend?.toUpperCase() || 'N/A'} ${indicators.ema5 && indicators.ema20 ? `(EMA5: $${indicators.ema5.toFixed(6)}, EMA20: $${indicators.ema20.toFixed(6)})` : ''}
- Bollinger Bands: Upper $${indicators.bollingerUpper?.toFixed(6) || 'N/A'}, Lower $${indicators.bollingerLower?.toFixed(6) || 'N/A'}
- ATR (Volatility): ${indicators.atr?.toFixed(6) || 'N/A'}
- Support: $${indicators.support?.toFixed(6) || 'N/A'}
- Resistance: $${indicators.resistance?.toFixed(6) || 'N/A'}
` : 'Technical indicators not available - use price action analysis'}
${timeframeSection}${volumeSection}${regimeSection}${performanceSection}${correlationSection}${positionStatusSection}${recentTradesSection}${swingLevelsSection}${candlePatternsSection}${priceActionSection}${btcContextSection}${winRateSection}${volumeAnomalySection}${rsiDivergenceSection}${extendedAnalyticsSection}${longerTermTrendsSection ? `\n${longerTermTrendsSection}` : ''}${selfAwarenessSection}${realtimePriceSection}${orderBookSection}${confluenceSection}${ensembleSection}
MARKET SENTIMENT:
${fearGreed ? `
- Fear & Greed Index: ${fearGreed.value} (${fearGreed.valueClassification})
- Sentiment: ${fearGreed.value <= 25 ? 'Extreme Fear' : fearGreed.value <= 45 ? 'Fear' : fearGreed.value <= 55 ? 'Neutral' : fearGreed.value <= 75 ? 'Greed' : 'Extreme Greed'}
- Trading Hint: ${fearGreed.value <= 30 ? 'Possible buying opportunity - fear may be overblown' : fearGreed.value >= 70 ? 'Consider taking profits - greed may be excessive' : 'Balanced sentiment - follow technical signals'}
` : 'Sentiment data not available'}

PORTFOLIO STATUS:
- Available USD for Trading: $${portfolioUSD.toFixed(2)}
- ${symbol} Holdings: ${coinBalance.toFixed(4)} (worth $${coinValueUSD.toFixed(2)})
- Current ${symbol} Allocation: ${coinAllocationPercent.toFixed(1)}% of portfolio
- Total Portfolio Value: $${totalPortfolioValue.toFixed(2)}

DYNAMIC POSITION SIZING (YOU DECIDE THE SIZE):
- You control trade size as % of available USD (1-20% per trade)
- Higher confidence = larger position size
- Conservative: 1-5% | Moderate: 5-10% | Aggressive: 10-20%
- RISK LIMIT: Max 20% of available USD per single trade
- Consider current exposure: ${coinAllocationPercent.toFixed(1)}% already in ${symbol}
${feeInfo ? `
TRADING FEES (CRITICAL):
- Taker Fee: ${feeInfo.takerFee}% per trade (market orders)
- Round-Trip Cost: ${feeInfo.roundTripFee.toFixed(2)}% (buy + sell)
- Minimum Profitable Trade: ${(feeInfo.roundTripFee + 0.1).toFixed(2)}%+ gain to cover fees
- FEE WARNING: Trades expecting <${feeInfo.roundTripFee.toFixed(2)}% gain will LOSE money after fees!
- Avoid scalping tight ranges - fees will eat your profits
- Quick profit target must exceed ${feeInfo.roundTripFee.toFixed(2)}% minimum
` : ''}
===== CHAIN-OF-THOUGHT REASONING FRAMEWORK =====
You MUST think step-by-step before making any decision. Follow this exact process:

STEP 1: PRIMARY SIGNAL ANALYSIS (60% weight in final decision)
Score each signal from -10 (strongly bearish) to +10 (strongly bullish):
a) TREND ALIGNMENT: Are 1h, 4h, and daily trends aligned in the same direction?
   - All aligned UP = +10, All aligned DOWN = -10, Mixed = 0
b) RSI SIGNAL: What is RSI telling us?
   - <30 oversold = +8 (reversal buy), >70 overbought = -8 (reversal sell), 30-70 = score based on direction
c) MACD MOMENTUM: Is histogram building or fading?
   - Positive and growing = +7, Negative and growing = -7, Near zero = 0
d) PRICE vs MOVING AVERAGES: Where is price relative to SMA20/SMA50?
   - Above both and rising = +6, Below both and falling = -6

STEP 2: CONFIRMATION SIGNALS (25% weight)
Score each from -5 to +5:
a) VOLUME: Is volume confirming the move?
   - High volume on up move = +5, High volume on down move = -5, Low volume = reduce confidence
b) BTC/ETH CONTEXT: What is the market leader doing?
   - BTC bullish = +4, BTC bearish = -4 (alts often follow BTC)
c) FEAR & GREED: What does sentiment suggest?
   - Extreme fear (<25) = +3 (contrarian buy), Extreme greed (>75) = -3 (contrarian sell)
d) SUPPORT/RESISTANCE: Where is price relative to key levels?
   - Near support = +4 (buy zone), Near resistance = -4 (sell zone)

STEP 3: RISK FACTORS (15% weight)
Adjust confidence based on these factors:
a) POSITION STATUS: Do we already have exposure?
   - In profit >3% → consider taking profits (bias toward SELL)
   - In loss >5% → evaluate stop-loss (bias toward SELL or HOLD)
   - No position → neutral
b) PORTFOLIO HEAT: How concentrated are we?
   - >50% in one coin = reduce new position size
c) REGIME: What type of market is this?
   - Trending = favor momentum trades
   - Ranging/choppy = favor mean reversion or HOLD
   - Volatile = smaller positions, wider stops

STEP 4: SIGNAL CONFLICT RESOLUTION
When signals disagree, apply this priority order:
1. TREND > MOMENTUM > OSCILLATORS (RSI/MACD)
2. HIGHER TIMEFRAME > LOWER TIMEFRAME
3. VOLUME-CONFIRMED moves > unconfirmed moves
4. If still unclear → HOLD is the safe choice

STEP 5: PRE-MORTEM (What could go wrong?)
Before finalizing, ask yourself:
- "What would make this trade fail?"
- "Am I seeing what I want to see, or what's actually there?"
- "If BTC dumps 5% in the next hour, how does this trade look?"

STEP 6: COGNITIVE BIAS CHECK
Guard against these common mistakes:
- RECENCY BIAS: Don't let the last 1-2 candles override the bigger picture
- CONFIRMATION BIAS: Did you look for reasons NOT to take this trade?
- FOMO: Is this urgency real or just fear of missing out?
- REVENGE TRADING: Are you trying to recover a recent loss too quickly?
- OVERCONFIDENCE: Your past accuracy matters - if you've been wrong recently, lower confidence

STEP 7: FINAL DECISION
Calculate your weighted score:
- Primary signals total × 0.60
- Confirmation signals total × 0.25  
- Risk adjustment × 0.15
= FINAL SCORE

Score interpretation:
- Score > +15: Strong BUY signal (confidence 70-90%)
- Score +5 to +15: Moderate BUY signal (confidence 50-70%)
- Score -5 to +5: HOLD - no clear edge (confidence 30-50%)
- Score -15 to -5: Moderate SELL signal (confidence 50-70%)
- Score < -15: Strong SELL signal (confidence 70-90%)

===== CRITICAL: FORCE DECISIVE ANSWERS =====

NO "SIDEWAYS" DEFAULT - You can ONLY say marketCondition="sideways" if ALL of these are true:
- RSI is between 45-55 (dead neutral)
- MACD histogram is near zero (between -0.0001 and +0.0001)
- Price is within 0.3% of the 24h average
- No clear trend on ANY timeframe

If ANY indicator shows a clear direction, you MUST choose "bullish" or "bearish".
Saying "sideways" when there ARE signals is LAZY and WRONG.

CONFIDENCE CALIBRATION - Use the FULL range, not just 40-50%:
- 85-95%: RARE - All signals strongly aligned, volume confirming, no conflicts
- 70-84%: 3+ signals agree, minor conflicts resolved, good setup
- 55-69%: 2 signals agree, some uncertainty but tradeable
- 40-54%: Mixed signals, low conviction, borderline
- 20-39%: Signals conflict, high uncertainty, lean toward hold
- <20%: Strong opposing signals, definitely hold

EXAMPLES of what each confidence LOOKS LIKE:
- 85%: RSI=28 oversold + MACD bullish cross + volume 2x average + price at support = STRONG BUY
- 70%: RSI=35 + MACD turning positive + BTC up = MODERATE BUY  
- 55%: RSI=42 + MACD slightly positive + volume normal = LEAN BUY
- 45%: RSI=50 + MACD near zero + mixed signals = GENUINE HOLD
- 30%: RSI=55 + MACD negative + but price at support = CONFLICTING, hold

ACTION-FORCING RULE:
You MUST pick BUY or SELL (not hold) if:
- RSI is below 35 OR above 65
- MACD histogram is clearly positive or negative (magnitude > 0.001)
- Price broke above resistance OR below support
- Volume is 1.5x+ above average

Only pick HOLD if the market is genuinely dead with no actionable signals.

${isDayTradeMode ? `DAY TRADER MODE ADJUSTMENTS:
- Lower the bar: Score > +8 is enough to BUY, Score < -8 is enough to SELL
- Act faster: ${targetProfitPercent}% profit is a WIN - take it
- Tighter stops: 2-5% stop-loss, 3-8% take-profit
- Higher urgency: Every minute counts
- Minimum confidence to trade: 40%` : `SWING TRADER MODE ADJUSTMENTS:
- Higher bar: Score > +12 required to BUY, Score < -12 required to SELL
- Be patient: Wait for 5-20% profit potential
- Wider stops: 5-10% stop-loss, 10-30% take-profit
- Let winners run: Don't exit for small gains
- Minimum confidence to trade: 60%`}

${usingLocalAI ? `LOCAL AI MODE: You have unlimited compute. Use it for thorough analysis.
Think through each step carefully. Show your work in the reasoning field.` : ''}

===== RESPONSE FORMAT =====
You MUST respond with this exact JSON structure.
Include ensemble votes and step-by-step analysis:

IMPORTANT: You must vote from each trading perspective BEFORE making your final decision.
The final action can only be BUY/SELL if at least 2 of 3 perspectives agree.

Respond in this exact JSON format:
{
  "action": "buy" | "sell" | "hold",
  "tradeAmountPercent": <number 1-20>,
  "stopLossPercent": <number 1-10>,
  "takeProfitPercent": <number 2-20>,
  "maxDrawdownPercent": <number 5-30>,
  "riskLevel": "conservative" | "moderate" | "aggressive",
  "strategy": "momentum" | "mean_reversion" | "dca" | "grid_trading",
  "marketCondition": "bullish" | "bearish" | "sideways" | "volatile",
  "confidence": <number 0-100>,
  "urgency": <number 1-10>,
  "ensembleVotes": {
    "momentum": {"vote": "buy" | "sell" | "hold", "confidence": <0-100>},
    "meanReversion": {"vote": "buy" | "sell" | "hold", "confidence": <0-100>},
    "riskManager": {"vote": "buy" | "sell" | "hold", "confidence": <0-100>}
  },
  "analysis": {
    "primaryScore": <number -31 to +31, sum of trend/RSI/MACD/MA signals>,
    "confirmationScore": <number -19 to +19, sum of volume/BTC/sentiment/levels signals>,
    "riskAdjustment": <number -10 to +10, based on position/portfolio/regime>,
    "finalScore": <number, weighted total>,
    "conflictResolution": "<which signals disagreed and how you resolved it>",
    "premortem": "<what could make this trade fail>",
    "biasCheck": "<which biases you checked for>"
  },
  "reasoning": "<2-3 sentence explanation connecting your analysis to your decision>"
}`;

  try {
    // Use per-request client instead of global (fixes bug where multiple users' endpoints get mixed)
    const client = getOpenAIClientWithConfig(customAiEndpoint || null);
    const model = customAiModel || (customAiEndpoint ? "local-model" : "gpt-4o");
    
    // Check if using a small model that needs simplified prompts (per-request)
    const usingSmallModel = isSmallModel(customAiModel, usingLocalAI);
    
    // Enhanced parameters for local AI (unlimited compute) vs cost-conscious OpenAI
    // Small models get lower temperature for more consistent outputs
    // Large models need more tokens for Chain-of-Thought reasoning
    const temperature = usingSmallModel ? 0.05 : (usingLocalAI ? 0.1 : 0.3);
    const maxTokens = usingSmallModel ? 500 : (usingLocalAI ? 3000 : 1000);
    
    console.log(`[AUTO-PILOT] Using AI model: ${model}${usingLocalAI ? ` via custom endpoint` : ''}${usingSmallModel ? ' (SIMPLIFIED PROMPTS for small model)' : ''}`);
    if (isInPositionMode) {
      console.log(`[AUTO-PILOT] POSITION MANAGEMENT MODE: ${symbol} - Entry: $${entryPrice!.toFixed(6)}, P/L: ${currentPnL >= 0 ? '+' : ''}${currentPnL.toFixed(2)}%`);
    } else {
      console.log(`[AUTO-PILOT] ENTRY SEARCH MODE: Looking for ${symbol} buy opportunities`);
    }
    
    // Use simplified prompt for small models
    let finalPrompt = prompt;
    let finalSystemPrompt: string;
    
    // === INJECT SCALPING CONTEXT INTO PROMPT IF ENABLED ===
    if (enableScalpingMode && scalpingContext && scalpingSignal) {
      finalPrompt = `${finalPrompt}

=== SCALPING MODE ACTIVE ===
${scalpingContext}

SCALPING SIGNAL SUMMARY:
- Action: ${scalpingSignal.action.toUpperCase()}
- Confidence: ${scalpingSignal.confidence}%
- Reasoning: ${scalpingSignal.reasoning}
- EMA Crossover: ${scalpingSignal.signals.emaCrossover.toUpperCase()}
- RSI Signal: ${scalpingSignal.signals.rsiSignal.replace(/_/g, ' ').toUpperCase()}
- Volume Spike: ${scalpingSignal.signals.volumeSpike ? 'YES' : 'NO'}
- Bollinger: ${scalpingSignal.signals.bollingerBreakout.toUpperCase()}
- VWAP: ${scalpingSignal.signals.vwapCross.toUpperCase()}
- Order Book: ${scalpingSignal.signals.orderBookBias.replace(/_/g, ' ').toUpperCase()}
- Spread OK: ${scalpingSignal.signals.spreadOk ? 'YES' : 'NO'}
- Not Choppy: ${scalpingSignal.signals.notChoppy ? 'YES' : 'NO'}

SCALPING DECISION WEIGHT: The scalping signal should heavily influence your final decision when scalping mode is active.
If scalping analysis says BUY with >60% confidence, strongly favor BUY.
If scalping analysis says SELL with >60% confidence, strongly favor SELL.
===`;
    }
    
    if (usingSmallModel) {
      // Build simplified prompt for small models with explicit confidence bands
      const priceChange = priceHistory.length >= 2 
        ? ((currentPrice - priceHistory[0]) / priceHistory[0] * 100) 
        : 0;
      const recentTrend: 'UP' | 'DOWN' | 'FLAT' = priceHistory.length >= 5 
        ? (priceHistory[priceHistory.length - 1] > priceHistory[priceHistory.length - 5] * 1.002 ? 'UP' 
          : priceHistory[priceHistory.length - 1] < priceHistory[priceHistory.length - 5] * 0.998 ? 'DOWN' 
          : 'FLAT')
        : 'FLAT';
      
      // Check if we have a position and calculate P/L
      const hasPosition = coinBalance > 0;
      // We don't have direct access to entry price here, so P/L will be null
      // The AI will rely on other signals for exit decisions
      const positionPnL: number | null = null;
      
      finalPrompt = buildSmallModelPrompt({
        symbol,
        currentPrice,
        priceChange,
        rsi: indicators?.rsi || null,
        macdHistogram: indicators?.macdHistogram || null,
        recentTrend,
        regime: regime.regime,
        fearGreedValue: fearGreed?.value || null,
        hasPosition,
        positionPnL,
        isDayTradeMode,
        portfolioUSD
      });
      
      finalSystemPrompt = getSmallModelSystemPrompt(isDayTradeMode);
      console.log(`[AUTO-PILOT] Using simplified prompt for small model (${finalPrompt.length} chars)`);
    } else {
      // Use full prompts for large models with Chain-of-Thought emphasis
      const cotEmphasis = `

CRITICAL: You MUST use Chain-of-Thought reasoning. Before deciding:
1. Score each signal explicitly (trend, RSI, MACD, volume, etc.)
2. Calculate your weighted final score
3. Check for conflicting signals and resolve them
4. Do a pre-mortem: what could make this trade fail?
5. Check for cognitive biases (FOMO, recency, revenge trading)
6. THEN make your decision based on the evidence

Include your analysis scores in the JSON response. Show your work.
Always respond with valid JSON only.`;
      
      // Scalping mode gets its own aggressive ultra-fast trading prompt
      if (enableScalpingMode && scalpingSettings) {
        finalSystemPrompt = `You are an ULTRA-AGGRESSIVE SCALPING AI. Your strategy is HIGH-FREQUENCY micro-profit trading on 1m/5m/15m timeframes.
        
SCALPING RULES:
- Target tiny gains: ${scalpingSettings.targetPercent}% profit targets
- Tight stops: ${scalpingSettings.stopPercent}% stop-loss, ${scalpingSettings.trailingPercent}% trailing stops
- Time limit: Exit any trade after ${scalpingSettings.timeoutMinutes} minutes regardless of P/L
- Speed is everything: Act on momentum bursts, volume spikes, and order book imbalances
- Don't overthink: If the scalping analysis says BUY or SELL, execute immediately
- EMA ${scalpingSettings.emaFast}/${scalpingSettings.emaSlow} crossovers are your primary signal
- RSI bursts (>=${scalpingSettings.rsiOverbought} or <=${scalpingSettings.rsiOversold}) trigger immediate action
- VWAP crosses and Bollinger Band squeezes confirm entries
- Avoid choppy markets (ATR filter: ${scalpingSettings.antiChopAtr})

You exist to capture micro-moves. Every second counts. Trade aggressively.${cotEmphasis}`;
      } else {
        finalSystemPrompt = isDayTradeMode
          ? (usingLocalAI 
            ? `You are an aggressive DAY TRADER AI with unlimited compute resources. Your strategy is ACTIVE trading - buy and sell frequently to capture small gains. Sitting on the sidelines is NOT your style. You'd rather make 10 small trades than wait for 1 big one. Trade more frequently - every price movement is an opportunity.${cotEmphasis}`
            : `You are an aggressive DAY TRADER AI. Your strategy is ACTIVE trading - you buy and sell frequently throughout the day to capture small gains. Sitting on the sidelines is NOT your style. You'd rather make 10 small trades than wait for 1 big one.${cotEmphasis}`)
          : (usingLocalAI
            ? `You are a SWING TRADER AI with unlimited compute resources. Your strategy is patient position trading - wait for high-probability setups and hold for larger gains (5-20%+). Quality over quantity. Don't exit for small 0.5-1% gains. Let winners run and use your compute for thorough multi-timeframe analysis.${cotEmphasis}`
            : `You are a SWING TRADER AI. Your strategy is patient position trading - you wait for high-probability setups and hold positions for larger gains (5-20%+). Don't exit for small 0.5-1% gains. Let winners run.${cotEmphasis}`);
      }
    }
    
    // Build request options - add structured output if enabled
    const requestOptions: any = {
      model: model,
      messages: [
        { role: "system", content: finalSystemPrompt },
        { role: "user", content: finalPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens,
    };
    
    // Add structured output schema if enabled (speeds up local LLM responses)
    if (customAiConfig.useStructuredOutput) {
      requestOptions.response_format = singleCoinResponseSchema;
      console.log(`[AUTO-PILOT] Using structured output schema for faster response`);
    }
    
    const response = await client.chat.completions.create(requestOptions);

    // Debug: log raw response structure for custom endpoints
    if (customAiConfig.endpoint) {
      console.log(`[AUTO-PILOT] Response received from custom endpoint${customAiConfig.useStructuredOutput ? ' (structured)' : ''}`);
      if (!response?.choices?.length) {
        console.log(`[AUTO-PILOT] WARNING: Unexpected response structure:`, JSON.stringify(response).substring(0, 500));
      }
    }

    const content = response?.choices?.[0]?.message?.content || '{}';
    
    if (content === '{}') {
      console.log(`[AUTO-PILOT] WARNING: Empty or missing content in response`);
    }
    
    // Use robust JSON parsing with repair for small models
    const parsed = parseJSONWithRepair(content, usingSmallModel);
    
    const action = parsed.action?.toLowerCase() as 'buy' | 'sell' | 'hold';
    const confidence = Math.min(100, Math.max(0, parsed.confidence || 50));
    const urgency = Math.min(10, Math.max(1, parsed.urgency || 5));
    
    // Extract Chain-of-Thought analysis for logging
    const analysis = parsed.analysis || {};
    if (analysis.primaryScore !== undefined || analysis.finalScore !== undefined) {
      console.log(`[AUTO-PILOT] Chain-of-Thought Analysis for ${symbol}:`);
      console.log(`  Primary Score: ${analysis.primaryScore ?? 'N/A'} | Confirmation: ${analysis.confirmationScore ?? 'N/A'} | Risk Adj: ${analysis.riskAdjustment ?? 'N/A'}`);
      console.log(`  Final Weighted Score: ${analysis.finalScore ?? 'N/A'}`);
      if (analysis.conflictResolution) {
        console.log(`  Conflict Resolution: ${analysis.conflictResolution}`);
      }
      if (analysis.premortem) {
        console.log(`  Pre-mortem: ${analysis.premortem}`);
      }
      if (analysis.biasCheck) {
        console.log(`  Bias Check: ${analysis.biasCheck}`);
      }
    }
    
    // === ENSEMBLE VOTING ENFORCEMENT ===
    // Require configurable number of perspectives to agree for BUY/SELL execution
    // For scalping mode, effectiveEnsembleMinAgree=0 disables ensemble gating entirely
    const ensembleVotes = parsed.ensembleVotes;
    let ensembleAgreement = 0;
    let ensembleConsensusAction: 'buy' | 'sell' | 'hold' = 'hold';
    let ensembleBlocked = false;
    const requiredAgreementPercent = effectiveEnsembleMinAgree === 0 ? 0 : Math.round((effectiveEnsembleMinAgree / 3) * 100); // 0=disabled, 1=33%, 2=66%, 3=100%
    
    // Skip ensemble gating entirely if effectiveEnsembleMinAgree is 0 (scalping mode)
    if (effectiveEnsembleMinAgree === 0) {
      console.log(`[ENSEMBLE] Scalping mode - ensemble gate DISABLED (effectiveEnsembleMinAgree=0)`);
    } else if (ensembleVotes?.momentum?.vote && ensembleVotes?.meanReversion?.vote && ensembleVotes?.riskManager?.vote) {
      const votes = [
        ensembleVotes.momentum.vote.toLowerCase(),
        ensembleVotes.meanReversion.vote.toLowerCase(),
        ensembleVotes.riskManager.vote.toLowerCase()
      ];
      
      // Count votes for each action
      const voteCounts = { buy: 0, sell: 0, hold: 0 };
      votes.forEach((v: string) => {
        if (v === 'buy' || v === 'sell' || v === 'hold') {
          voteCounts[v as 'buy' | 'sell' | 'hold']++;
        }
      });
      
      // Find the action with most votes
      const maxVotes = Math.max(voteCounts.buy, voteCounts.sell, voteCounts.hold);
      ensembleAgreement = Math.round((maxVotes / 3) * 100);
      
      if (voteCounts.buy >= effectiveEnsembleMinAgree) ensembleConsensusAction = 'buy';
      else if (voteCounts.sell >= effectiveEnsembleMinAgree) ensembleConsensusAction = 'sell';
      else ensembleConsensusAction = 'hold';
      
      // Log ensemble voting results
      console.log(`[ENSEMBLE] Voting Results for ${symbol}:`);
      console.log(`  Momentum: ${votes[0].toUpperCase()} (${ensembleVotes.momentum.confidence}%)`);
      console.log(`  Mean Reversion: ${votes[1].toUpperCase()} (${ensembleVotes.meanReversion.confidence}%)`);
      console.log(`  Risk Manager: ${votes[2].toUpperCase()} (${ensembleVotes.riskManager.confidence}%)`);
      console.log(`  Consensus: ${ensembleConsensusAction.toUpperCase()} with ${ensembleAgreement}% agreement (requires ${effectiveEnsembleMinAgree}/3 = ${requiredAgreementPercent}%)`);
      
      // Block execution if AI action doesn't match ensemble consensus
      if (action !== 'hold' && action !== ensembleConsensusAction) {
        ensembleBlocked = true;
        console.log(`[ENSEMBLE] ⚠️ BLOCKED: AI wants ${action.toUpperCase()} but ensemble says ${ensembleConsensusAction.toUpperCase()}`);
      }
      
      // Block if fewer than required number agree
      if (action !== 'hold' && ensembleAgreement < requiredAgreementPercent) {
        ensembleBlocked = true;
        console.log(`[ENSEMBLE] ⚠️ BLOCKED: Agreement ${ensembleAgreement}% is below ${requiredAgreementPercent}% threshold (${effectiveEnsembleMinAgree}/3 required)`);
      }
    } else if (!usingSmallModel) {
      // For full models, missing votes = block the trade (require consensus)
      if (action !== 'hold') {
        ensembleBlocked = true;
        console.log(`[ENSEMBLE] ⚠️ No voting data received from AI - treating as blocked for safety`);
      }
    } else {
      // Small models skip ensemble gating (too complex for simplified prompts)
      console.log(`[ENSEMBLE] Small model mode - skipping ensemble gate`);
    }
    
    // === DYNAMIC POSITION SIZING ===
    // AI requests a percentage of available USD (1-20% max per trade)
    const requestedPercent = Math.min(20, Math.max(1, parsed.tradeAmountPercent || 10));
    
    // Apply confidence-based multiplier (higher confidence = closer to requested size)
    // 100% confidence = 100% of requested, 50% confidence = 75% of requested, 0% confidence = 50% of requested
    const confidenceMultiplier = 0.5 + (confidence / 200); // Range: 0.5 to 1.0
    
    // Final trade percent with all adjustments
    const baseTradeAmountPercent = requestedPercent * confidenceMultiplier;
    
    console.log(`[AUTO-PILOT] Position sizing: AI requested ${requestedPercent}%, confidence ${confidence}% -> final ${baseTradeAmountPercent.toFixed(2)}% of $${portfolioUSD.toFixed(2)} = $${(portfolioUSD * baseTradeAmountPercent / 100).toFixed(2)}`);
    
    // Guard against zero/near-zero portfolio to prevent NaN/Infinity
    if (!portfolioUSD || portfolioUSD < 1 || !isFinite(portfolioUSD)) {
      console.log(`[AUTO-PILOT] Insufficient portfolio value ($${portfolioUSD}) - skipping trade`);
      return {
        action: 'hold',
        symbol,
        tradeAmountUSD: 0,
        reasoning: 'Insufficient portfolio value for trading',
        confidence: 0,
        urgency: 1,
        strategyUsed: 'none',
        riskAdjustedSettings: {
          stopLossPercent: 5,
          takeProfitPercent: 10,
          maxDrawdownPercent: 20,
          tradeAmountPercent: 0,
          riskLevel: 'conservative',
          recommendedStrategy: 'mean_reversion',
          shouldTrade: false,
          reasoning: 'Insufficient portfolio',
          confidenceLevel: 0,
          marketCondition: 'sideways',
        },
      } as AutoPilotDecision;
    }
    
    // Apply dynamic position sizing based on confidence and market regime
    const dynamicSizing = calculateDynamicPositionSize(
      (portfolioUSD * baseTradeAmountPercent) / 100,
      confidence,
      regime,
      indicators?.atr || 0
    );
    
    // === HARD CAP ENFORCEMENT: Max 20% per single trade ===
    const maxTradeAmountUSD = portfolioUSD * 0.20; // 20% hard cap
    const cappedTradeAmountUSD = Math.min(dynamicSizing.adjustedAmount, maxTradeAmountUSD);
    const adjustedTradeAmountUSD = cappedTradeAmountUSD;
    const adjustedTradePercent = portfolioUSD > 0 ? (adjustedTradeAmountUSD / portfolioUSD) * 100 : 0;
    
    const wasCapped = dynamicSizing.adjustedAmount > maxTradeAmountUSD;
    console.log(`[AUTO-PILOT] Dynamic sizing: Base $${((portfolioUSD * baseTradeAmountPercent) / 100).toFixed(2)} -> Adjusted $${adjustedTradeAmountUSD.toFixed(2)} (${dynamicSizing.reasoning})${wasCapped ? ' [CAPPED at 20%]' : ''}`);
    
    const settings: AutoPilotSettings = {
      stopLossPercent: Math.min(20, Math.max(1, parsed.stopLossPercent || 5)),
      takeProfitPercent: Math.min(50, Math.max(5, parsed.takeProfitPercent || 10)),
      maxDrawdownPercent: Math.min(50, Math.max(5, parsed.maxDrawdownPercent || 20)),
      tradeAmountPercent: Math.min(20, Math.max(1, adjustedTradePercent)), // Cap at 20% for display
      riskLevel: parsed.riskLevel || 'moderate',
      recommendedStrategy: parsed.strategy || 'momentum',
      shouldTrade: action !== 'hold',
      reasoning: parsed.reasoning || 'AI decision',
      confidenceLevel: confidence,
      marketCondition: parsed.marketCondition || 'sideways',
    };

    // If dynamic sizing returned 0 (insufficient base), respect that decision
    const finalTradeAmount = adjustedTradeAmountUSD > 0 
      ? Math.max(5, adjustedTradeAmountUSD) // Only apply minimum if there's a valid amount
      : 0; // Otherwise skip trading
    
    // Calculate estimated time to reach take profit target
    const timeToTarget = calculateTimeToTarget(
      priceHistory,
      currentPrice,
      settings.takeProfitPercent,
      indicators?.atr ?? undefined
    );
    
    // Build Chain-of-Thought analysis object if available
    const chainOfThought: ChainOfThoughtAnalysis | undefined = 
      (analysis.primaryScore !== undefined || analysis.finalScore !== undefined) 
        ? {
            primaryScore: analysis.primaryScore,
            confirmationScore: analysis.confirmationScore,
            riskAdjustment: analysis.riskAdjustment,
            finalScore: analysis.finalScore,
            conflictResolution: analysis.conflictResolution,
            premortem: analysis.premortem,
            biasCheck: analysis.biasCheck,
          }
        : undefined;
    
    let decision: AutoPilotDecision = {
      action: adjustedTradeAmountUSD <= 0 ? 'hold' : (action || 'hold'),
      symbol,
      tradeAmountUSD: finalTradeAmount,
      reasoning: adjustedTradeAmountUSD <= 0 
        ? `Skipping trade: ${dynamicSizing.reasoning}`
        : `${parsed.reasoning || 'AI Auto-Pilot decision'} [Size adjusted: ${dynamicSizing.reasoning}]`,
      confidence: settings.confidenceLevel,
      urgency,
      strategyUsed: settings.recommendedStrategy,
      riskAdjustedSettings: settings,
      positionSizeAdjusted: dynamicSizing.sizeMultiplier !== 1,
      regimeDetected: regime.regime,
      timeToTargetMinutes: timeToTarget,
      chainOfThought,
    };
    
    // === NO POSITION GATE: Block SELL when user has no balance ===
    // This prevents the AI from recommending SELL for coins the user doesn't own
    if (decision.action === 'sell' && coinBalance <= 0) {
      console.log(`[NO POSITION GATE] ${symbol}: Blocked SELL - user has 0 balance, converting to HOLD`);
      decision.action = 'hold';
      decision.reasoning = `NO POSITION GATE: Cannot sell ${symbol} - no position held. Looking for BUY opportunities instead.`;
      decision.confidence = 50;
    }
    
    // === MOMENTUM INJECTION: Override hold to buy/sell for massive 24h moves ===
    // This is for coins that have pumped above the momentum threshold but the AI conservatively said "hold"
    const is24hMassive = Math.abs(real24hChange) >= momentumThreshold;
    const shouldInjectMomentum = is24hMassive && decision.action === 'hold' && decision.confidence >= 40;
    
    if (shouldInjectMomentum) {
      const injectedAction = real24hChange > 0 ? 'buy' : 'sell';
      // Block SELL injection if user has no balance
      if (injectedAction === 'sell' && coinBalance <= 0) {
        console.log(`[MOMENTUM INJECTION] ${symbol}: Blocked SELL injection - user has 0 balance`);
      } else {
        const injectedConfidence = Math.max(70, decision.confidence);
        console.log(`[MOMENTUM INJECTION] ${symbol}: Overriding HOLD to ${injectedAction.toUpperCase()} due to massive 24h move (${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}%)`);
        decision.action = injectedAction;
        decision.confidence = injectedConfidence;
        decision.reasoning = `[MOMENTUM INJECTION: ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}% 24h move overrides hold] ${decision.reasoning}`;
      }
    }
    
    // === CONFLUENCE GATING: Block trades when timeframes don't agree ===
    // EXCEPTION: Bypass confluence gate if 24h change is massive (momentum override)
    const momentumOverride = is24hMassive && 
      ((real24hChange > 0 && decision.action === 'buy') || 
       (real24hChange < 0 && decision.action === 'sell'));
    
    const confluenceBlocked = confluence.confluenceScore < effectiveConfluenceThreshold;
    if (decision.action !== 'hold' && confluenceBlocked && !momentumOverride) {
      const prevAction = decision.action;
      const prevConfidence = decision.confidence;
      decision.action = 'hold';
      decision.confidence = Math.min(40, decision.confidence);
      decision.reasoning = `CONFLUENCE GATE: ${prevAction.toUpperCase()} blocked - only ${confluence.confluenceScore}% timeframe alignment (requires ${effectiveConfluenceThreshold}%+). ${confluence.recommendation}. Original decision: ${prevAction} @ ${prevConfidence}% confidence`;
      console.log(`[CONFLUENCE GATE] ${symbol}: Blocked ${prevAction.toUpperCase()} - confluence score ${confluence.confluenceScore}% < ${effectiveConfluenceThreshold}% threshold`);
    } else if (decision.action !== 'hold' && confluenceBlocked && momentumOverride) {
      // Allow trade through due to massive 24h momentum
      console.log(`[CONFLUENCE GATE] ${symbol}: BYPASSED due to massive 24h move (${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}%) - allowing ${decision.action.toUpperCase()}`);
      decision.reasoning += ` [MOMENTUM OVERRIDE: 24h move of ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}% bypassed confluence gate]`;
    } else if (decision.action !== 'hold' && !confluenceBlocked) {
      // Boost confidence if confluence is high
      if (confluence.confluenceScore >= 80) {
        const boost = Math.min(10, (confluence.confluenceScore - effectiveConfluenceThreshold) / 4);
        decision.confidence = Math.min(95, decision.confidence + boost);
        decision.reasoning += ` [HIGH CONFLUENCE ${confluence.confluenceScore}%: +${boost.toFixed(0)}% confidence boost]`;
        console.log(`[CONFLUENCE] ${symbol}: High confluence (${confluence.confluenceScore}%) - boosted confidence by ${boost.toFixed(0)}%`);
      }
    }
    
    // === ORDER BOOK GATING: Block trades against heavy pressure ===
    if (decision.action !== 'hold' && orderBook) {
      const orderBookConflict = 
        (decision.action === 'buy' && (orderBook.signal === 'strong_sell' || (orderBook.signal === 'sell' && orderBook.imbalanceRatio < effectiveOrderBookBuyThreshold))) ||
        (decision.action === 'sell' && (orderBook.signal === 'strong_buy' || (orderBook.signal === 'buy' && orderBook.imbalanceRatio > effectiveOrderBookSellThreshold)));
      
      if (orderBookConflict) {
        const prevAction = decision.action;
        decision.action = 'hold';
        decision.confidence = Math.min(35, decision.confidence);
        decision.reasoning = `ORDER BOOK GATE: ${prevAction.toUpperCase()} blocked - trading against heavy ${orderBook.signal.replace('_', ' ')} pressure (imbalance: ${orderBook.imbalanceRatio.toFixed(2)}x, threshold: ${prevAction === 'buy' ? effectiveOrderBookBuyThreshold : effectiveOrderBookSellThreshold}x). Original: ${prevAction}`;
        console.log(`[ORDER BOOK GATE] ${symbol}: Blocked ${prevAction.toUpperCase()} - order book shows ${orderBook.signal} (${orderBook.imbalanceRatio.toFixed(2)}x)`);
      } else if (
        (decision.action === 'buy' && orderBook.signal === 'strong_buy') ||
        (decision.action === 'sell' && orderBook.signal === 'strong_sell')
      ) {
        // Boost confidence when order book confirms direction
        decision.confidence = Math.min(95, decision.confidence + 5);
        decision.reasoning += ` [ORDER BOOK CONFIRMS: ${orderBook.signal.replace('_', ' ')}]`;
        console.log(`[ORDER BOOK] ${symbol}: Order book confirms ${decision.action} - ${orderBook.signal}`);
      }
    }
    
    // === ENSEMBLE VOTING GATING: Block trades without required consensus ===
    // EXCEPTION: Bypass ensemble gate if 24h change is massive (momentum override)
    const ensembleMomentumOverride = is24hMassive && 
      ((real24hChange > 0 && decision.action === 'buy') || 
       (real24hChange < 0 && decision.action === 'sell'));
    
    if (decision.action !== 'hold' && ensembleBlocked && !ensembleMomentumOverride) {
      const prevAction = decision.action;
      const prevConfidence = decision.confidence;
      decision.action = 'hold';
      decision.confidence = Math.min(30, decision.confidence);
      decision.reasoning = `ENSEMBLE GATE: ${prevAction.toUpperCase()} blocked - insufficient voting consensus (${ensembleAgreement}% agreement, needs ${requiredAgreementPercent}%+, ${effectiveEnsembleMinAgree}/3 required). Ensemble consensus: ${ensembleConsensusAction.toUpperCase()}. Original: ${prevAction} @ ${prevConfidence}%`;
      console.log(`[ENSEMBLE GATE] ${symbol}: Blocked ${prevAction.toUpperCase()} - ensemble consensus is ${ensembleConsensusAction.toUpperCase()} (${ensembleAgreement}% agreement, needs ${effectiveEnsembleMinAgree}/3)`);
    } else if (decision.action !== 'hold' && ensembleBlocked && ensembleMomentumOverride) {
      // Allow trade through due to massive 24h momentum
      console.log(`[ENSEMBLE GATE] ${symbol}: BYPASSED due to massive 24h move (${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}%) - allowing ${decision.action.toUpperCase()}`);
      decision.reasoning += ` [MOMENTUM OVERRIDE: 24h move of ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}% bypassed ensemble gate]`;
    } else if (decision.action !== 'hold' && ensembleAgreement >= requiredAgreementPercent && ensembleConsensusAction === decision.action) {
      // Boost confidence when ensemble unanimously agrees
      const agreementBoost = ensembleAgreement === 100 ? 10 : 5;
      decision.confidence = Math.min(95, decision.confidence + agreementBoost);
      decision.reasoning += ` [ENSEMBLE CONFIRMS: ${ensembleAgreement}% agreement for ${ensembleConsensusAction.toUpperCase()}]`;
      console.log(`[ENSEMBLE] ${symbol}: Ensemble confirms ${decision.action} with ${ensembleAgreement}% agreement - boosted confidence by ${agreementBoost}%`);
    }
    
    // VALIDATION PASS: For local AI, have it confirm its own decision
    // SKIP validation for momentum override scenarios - the 24h move IS the signal
    const skipValidation = is24hMassive && 
      ((real24hChange > 0 && decision.action === 'buy') || 
       (real24hChange < 0 && decision.action === 'sell'));
    
    if (skipValidation) {
      console.log(`[AUTO-PILOT] Skipping validation pass for ${symbol} - MOMENTUM OVERRIDE active (24h: ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(1)}%)`);
    }
    
    if (usingLocalAI && decision.action !== 'hold' && decision.tradeAmountUSD > 0 && !skipValidation) {
      console.log(`[AUTO-PILOT] Running validation pass for ${symbol} ${decision.action} decision...`);
      
      const validationPrompt = `You are reviewing a trading decision. Please validate if this decision is sound.

ORIGINAL DECISION:
- Action: ${decision.action.toUpperCase()}
- Symbol: ${symbol}
- Trade Amount: $${decision.tradeAmountUSD.toFixed(2)}
- Confidence: ${decision.confidence}%
- Reasoning: ${decision.reasoning}
- Strategy: ${decision.strategyUsed}
- Market Regime: ${decision.regimeDetected}

KEY MARKET DATA:
- Current Price: $${currentPrice.toFixed(6)}
- RSI: ${indicators?.rsi?.toFixed(2) || 'N/A'}
- MACD Histogram: ${indicators?.macdHistogram?.toFixed(6) || 'N/A'}
- Micro-Trend (5/20 EMA): ${indicators?.microTrend?.toUpperCase() || 'N/A'}
- Market Regime: ${regime.regime}
- Fear & Greed: ${fearGreed?.value || 'N/A'} (${fearGreed?.valueClassification || 'N/A'})
- 24H Change: ${real24hChange > 0 ? '+' : ''}${real24hChange.toFixed(2)}%

VALIDATION TASK:
1. Is this decision consistent with the market data?
2. Are there any red flags or contradictions?
3. Should this trade proceed, be modified, or be cancelled?

NOTE: If 24h change is massive (8%+) in the direction of the trade, this is a strong momentum signal that should be respected.

Respond in JSON:
{
  "validated": true | false,
  "adjustedAction": "buy" | "sell" | "hold",
  "adjustedConfidence": <number 0-100>,
  "validationReasoning": "<why you approve or reject this trade>"
}`;

      try {
        const validationResponse = await client.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: "You are a trading risk validator. Review decisions for consistency and safety. Respond with valid JSON only." },
            { role: "user", content: validationPrompt }
          ],
          temperature: 0.1,
          max_tokens: 500,
        });
        
        const validationContent = validationResponse?.choices?.[0]?.message?.content || '{}';
        const validationMatch = validationContent.match(/\{[\s\S]*\}/);
        
        if (validationMatch) {
          const validation = JSON.parse(validationMatch[0]);
          
          // Safeguard: check for required fields
          if (typeof validation.validated === 'undefined' || typeof validation.adjustedAction === 'undefined') {
            console.log(`[AUTO-PILOT] Validation returned malformed response, defaulting to HOLD for safety`);
            decision = { ...decision, action: 'hold', tradeAmountUSD: 0, reasoning: '[VALIDATION MALFORMED] Defaulting to hold for safety' };
          } else if (!validation.validated || validation.adjustedAction === 'hold') {
            console.log(`[AUTO-PILOT] Validation REJECTED: ${validation.validationReasoning}`);
            decision = {
              ...decision,
              action: 'hold',
              tradeAmountUSD: 0,
              reasoning: `[VALIDATION REJECTED] ${validation.validationReasoning || 'Failed validation pass'}`,
              confidence: validation.adjustedConfidence || 0,
            };
          } else {
            console.log(`[AUTO-PILOT] Validation CONFIRMED: ${validation.validationReasoning}`);
            decision = {
              ...decision,
              confidence: validation.adjustedConfidence || decision.confidence,
              reasoning: `${decision.reasoning} [VALIDATED: ${validation.validationReasoning}]`,
            };
          }
        }
      } catch (validationError) {
        console.log(`[AUTO-PILOT] Validation pass error (proceeding with original decision):`, validationError);
      }
    }
    
    // === FINAL SAFEGUARD: Ensure SELL is never returned for coins with 0 balance ===
    if (decision.action === 'sell' && coinBalance <= 0) {
      console.log(`[FINAL SAFEGUARD] ${symbol}: Converting SELL to HOLD - user has 0 balance`);
      decision.action = 'hold';
      decision.reasoning = `Cannot sell ${symbol} - no position held.`;
      decision.confidence = 50;
    }
    
    // Cache the decision to reduce API calls (only for OpenAI to save costs)
    if (!usingLocalAI) {
      autoPilotCache.set(cacheKey, { decision, timestamp: Date.now() });
      console.log(`[AUTO-PILOT] Cached decision for ${symbol}: ${decision.action} with ${decision.confidence}% confidence (valid for 60s)`);
    } else {
      console.log(`[AUTO-PILOT] Final decision for ${symbol}: ${decision.action} with ${decision.confidence}% confidence, regime: ${regime.regime}`);
    }
    
    return decision;
  } catch (error) {
    console.error('[AutoPilot] Error making decision:', error);
    
    return {
      action: 'hold',
      symbol,
      tradeAmountUSD: 0,
      reasoning: 'Error in AI analysis - holding position',
      confidence: 0,
      urgency: 1,
      strategyUsed: 'none',
      riskAdjustedSettings: {
        stopLossPercent: 5,
        takeProfitPercent: 10,
        maxDrawdownPercent: 20,
        tradeAmountPercent: 5,
        riskLevel: 'conservative',
        recommendedStrategy: 'dca',
        shouldTrade: false,
        reasoning: 'Fallback to safe defaults due to error',
        confidenceLevel: 0,
        marketCondition: 'sideways',
      },
    };
  }
}

// Batched analysis - analyze all coins in a single AI request (for local AI efficiency)
async function analyzeAllCoinsBatched(
  coins: { symbol: string; price: number; priceHistory: number[]; balance: number; indicators: TechnicalIndicators | null; coinValueUSD: number }[],
  portfolioUSD: number,
  fearGreed: FearGreedData | null,
  enableQuickProfit: boolean = false,
  quickProfitPercent: number = 1.0,
  customAiEndpoint?: string | null,
  customAiModel?: string | null
): Promise<AutoPilotDecision[]> {
  // Determine trading style based on user settings
  const isDayTradeMode = enableQuickProfit === true;
  const targetProfitPercent = quickProfitPercent || 1.0;
  // Use per-request client instead of global
  const client = getOpenAIClientWithConfig(customAiEndpoint || null);
  const model = customAiModel || "local-model";
  const totalPortfolioValue = portfolioUSD + coins.reduce((sum, c) => sum + c.coinValueUSD, 0);
  
  // Build consolidated market data for all coins with FULL context (matching single-coin path)
  const coinDataSections = coins.map(coin => {
    const regime = detectMarketRegime(coin.symbol, coin.priceHistory);
    const multiTimeframe = getMultiTimeframeAnalysis(coin.symbol);
    const volumeData = getVolumeData(coin.symbol);
    const performance = getPerformanceStats(coin.symbol);
    const allocation = totalPortfolioValue > 0 ? (coin.coinValueUSD / totalPortfolioValue) * 100 : 0;
    const swingLevels = getSwingLevels(coin.symbol);
    const candlePatterns = detectCandlePatterns(coin.symbol);
    const significantPatterns = candlePatterns.filter(p => p.pattern !== 'none');
    
    let section = `
=== ${coin.symbol} ===
Price: $${coin.price.toFixed(6)} | Holdings: ${coin.balance.toFixed(4)} ($${coin.coinValueUSD.toFixed(2)}) | Allocation: ${allocation.toFixed(1)}%
Price Change: ${coin.priceHistory.length >= 2 ? ((coin.price - coin.priceHistory[0]) / coin.priceHistory[0] * 100).toFixed(2) : '0'}%
RSI: ${coin.indicators?.rsi?.toFixed(1) || 'N/A'} ${coin.indicators?.rsi ? (coin.indicators.rsi > 70 ? '(OVERBOUGHT)' : coin.indicators.rsi < 30 ? '(OVERSOLD)' : '') : ''} | MACD: ${coin.indicators?.macdHistogram?.toFixed(6) || 'N/A'} ${coin.indicators?.macdHistogram ? (coin.indicators.macdHistogram > 0 ? '(BULLISH)' : '(BEARISH)') : ''}
SMA20: ${coin.indicators?.sma20?.toFixed(6) || 'N/A'} ${coin.indicators?.sma20 ? (coin.price > coin.indicators.sma20 ? '(Above)' : '(Below)') : ''} | Micro-Trend: ${coin.indicators?.microTrend?.toUpperCase() || 'N/A'} | Support: ${coin.indicators?.support?.toFixed(6) || 'N/A'} | Resistance: ${coin.indicators?.resistance?.toFixed(6) || 'N/A'}
Regime: ${regime.regime} (${regime.strength.toFixed(0)}% strength) | Timeframe: ${multiTimeframe?.alignment || 'N/A'}
Volume: ${volumeData?.volumeTrend || 'N/A'} | Win Rate: ${performance.totalTrades > 0 ? performance.winRate.toFixed(0) + '%' : 'N/A'}`;
    
    if (swingLevels) {
      section += `\nSwing Levels: High $${swingLevels.recentHigh.toFixed(6)} (${swingLevels.distanceToHigh.toFixed(1)}% away) | Low $${swingLevels.recentLow.toFixed(6)} (${swingLevels.distanceToLow.toFixed(1)}% away)`;
    }
    
    if (significantPatterns.length > 0) {
      section += `\nPatterns: ${significantPatterns.map(p => `${p.timeframe} ${p.pattern.replace('_', ' ')} (${p.strength.toFixed(0)}%)`).join(', ')}`;
    }
    
    return section;
  }).join('\n');

  // Build trading style section for batched prompt
  const batchTradingStyleSection = isDayTradeMode ? `You are an aggressive DAY TRADER AI analyzing ${coins.length} coins simultaneously.
Your strategy is ACTIVE trading - you buy and sell frequently to capture small gains. Sitting on the sidelines is NOT your style.

CRITICAL DAY TRADING RULES:
- You are a DAY TRADER. You do NOT hold positions for long periods.
- Your goal is to make quick, small profits. A ${targetProfitPercent}% gain is a WIN - take it!
- Don't wait for perfect setups. If the market is moving, you should be trading.
- NEVER let a winning trade turn into a losing trade. Protect profits aggressively.
- 55% confidence = TRADE. Below 55% = HOLD and wait for better setup.
- MINIMUM 1% profit target ensures trades are profitable after fees.

AGGRESSIVE LOCAL AI MODE:
Trade frequently but ONLY with 55%+ confidence.
Don't overthink, but filter out low-quality setups.
You have unlimited compute - find high-probability opportunities.` : `You are a SWING TRADER AI analyzing ${coins.length} coins simultaneously.
Your strategy is patient position trading - you wait for high-probability setups and hold positions for larger gains. Quality over quantity.

CRITICAL SWING TRADING RULES:
- You are a SWING TRADER. You hold positions for meaningful moves (5-20%+ gains).
- Your goal is to capture substantial price swings. Don't exit for small 0.5-1% gains.
- Wait for high-probability setups. Patience is more profitable than overtrading.
- Let winners run - don't cut profits short. Use trailing stops instead.
- 60% confidence minimum = TRADE. Be selective and patient for better entries.

LOCAL AI ANALYSIS MODE:
Analyze thoroughly. Take your time to find high-probability setups.
Wait for clear trend confirmation before entering.
You have unlimited compute - use it for deep multi-timeframe analysis.`;

  const batchAnalysisSection = isDayTradeMode ? `DAY TRADER ANALYSIS:
1. Scan ALL coins for opportunities - require volatility > 0.3% to trade
2. Diversify trades across multiple coins when possible
3. ONLY 55%+ confidence signals should trigger trades - filter out noise
4. HOLD is acceptable when volatility is too low or signals are weak
5. Set tight stop-losses (2-5%) and take-profits (3-10%)
6. Rate urgency 1-10 for each opportunity (10 = trade NOW!)` : `SWING TRADER ANALYSIS:
1. Identify coins with strong multi-day/week trends and high-probability setups
2. Focus on quality entries, not quantity of trades
3. Only trade with 60%+ confidence - be selective
4. HOLD is often the best decision - swing traders are patient
5. Set wider stop-losses (5-10%) and take-profits (10-30%)
6. Rate urgency 1-10 for each opportunity (most will be low)`;

  const batchPrompt = `${batchTradingStyleSection}

PORTFOLIO STATUS:
- Available USD: $${portfolioUSD.toFixed(2)}
- Total Portfolio Value: $${totalPortfolioValue.toFixed(2)}

MARKET SENTIMENT:
${fearGreed ? `- Fear & Greed Index: ${fearGreed.value} (${fearGreed.valueClassification})
- Hint: ${isDayTradeMode 
  ? (fearGreed.value <= 30 ? 'Fear = BUY opportunity!' : fearGreed.value >= 70 ? 'Greed = SELL opportunity!' : 'Any movement = trade opportunity') 
  : (fearGreed.value <= 30 ? 'Extreme fear may signal bottoms - look for quality entries' : fearGreed.value >= 70 ? 'Extreme greed may signal tops - consider taking profits on winners' : 'Neutral sentiment - follow trend confirmation')}` : '- Sentiment data not available'}

COIN DATA:
${coinDataSections}

${batchAnalysisSection}

===== FORCE DECISIVE ANSWERS =====
NO SIDEWAYS DEFAULT: Only use marketCondition="sideways" if RSI is 45-55 AND MACD is near zero AND no clear trend.
If ANY indicator shows direction, choose "bullish" or "bearish".

CONFIDENCE CALIBRATION - Use the FULL 0-100 range:
- 80%+: Strong aligned signals (RSI oversold + MACD bullish + volume spike)
- 60-79%: 2-3 signals agree, tradeable setup
- 40-59%: Mixed signals, lower conviction
- <40%: Conflicting signals, lean toward hold

ACTION FORCING: You MUST choose BUY or SELL (not hold) if RSI < 35 or RSI > 65.

For each coin, provide a complete decision.

DYNAMIC POSITION SIZING:
- Trade size is % of available USD (1-20% per trade max)
- Higher confidence = larger position. Conservative: 1-5%, Moderate: 5-10%, Aggressive: 10-20%
- RISK LIMIT: Max 20% of available USD per single trade

TIME-TO-TARGET PREDICTION (CRITICAL FOR ACCURACY TRACKING):
- For BUY/SELL signals, predict how many minutes until your target price is reached
- Base this on volatility, momentum, and distance to target
- Day trades: typically 5-60 minutes
- Swing trades: typically 60-1440 minutes (1-24 hours)
- Be realistic - your predictions will be checked at this time

Respond with a JSON array (one object per coin in the same order):
[
  {
    "symbol": "COIN",
    "action": "buy" | "sell" | "hold",
    "tradeAmountPercent": <1-20, percentage of available USD>,
    "stopLossPercent": <1-10>,
    "takeProfitPercent": <2-20>,
    "maxDrawdownPercent": <5-30>,
    "riskLevel": "conservative" | "moderate" | "aggressive",
    "strategy": "momentum" | "mean_reversion" | "dca" | "grid_trading",
    "marketCondition": "bullish" | "bearish" | "sideways" | "volatile",
    "confidence": <0-100>,
    "urgency": <1-10>,
    "estimatedMinutesToTarget": <5-1440, when you expect target to be hit>,
    "reasoning": "<brief reason>"
  }
]`;

  try {
    console.log(`[AUTO-PILOT] Batched analysis for ${coins.length} coins in single request...`);
    
    const batchSystemPrompt = isDayTradeMode
      ? "You are an aggressive DAY TRADER AI. Your strategy is ACTIVE trading - buy and sell frequently to capture small gains. Sitting on the sidelines is NOT your style. You'd rather make 10 small trades than wait for 1 big one. Trade more frequently - every price movement is an opportunity. Don't overthink - trust your analysis and ACT. Respond with a JSON array."
      : "You are a SWING TRADER AI. Your strategy is patient position trading - wait for high-probability setups and hold for larger gains (5-20%+). Quality over quantity. Don't exit for small 0.5-1% gains. Let winners run. Focus on quality entries, not quantity of trades. Respond with a JSON array.";
    
    // Build request options - add structured output if enabled
    const batchRequestOptions: any = {
      model: model,
      messages: [
        { role: "system", content: batchSystemPrompt },
        { role: "user", content: batchPrompt }
      ],
      temperature: 0.1,
      max_tokens: 3000,
    };
    
    // Add structured output schema for batch if enabled
    if (customAiConfig.useStructuredOutput) {
      batchRequestOptions.response_format = batchCoinResponseSchema;
      console.log(`[AUTO-PILOT] Using structured output schema for batch analysis`);
    }
    
    const response = await client.chat.completions.create(batchRequestOptions);

    const content = response?.choices?.[0]?.message?.content || '[]';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (!jsonMatch) {
      console.log(`[AUTO-PILOT] Failed to parse batched response, falling back to individual analysis`);
      throw new Error("No JSON array found in batched response");
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      symbol: string;
      action: 'buy' | 'sell' | 'hold';
      tradeAmountPercent: number;
      stopLossPercent?: number;
      takeProfitPercent?: number;
      maxDrawdownPercent?: number;
      riskLevel?: 'conservative' | 'moderate' | 'aggressive';
      strategy?: 'momentum' | 'mean_reversion' | 'dca' | 'grid_trading';
      marketCondition?: 'bullish' | 'bearish' | 'sideways' | 'volatile';
      confidence: number;
      urgency?: number;
      estimatedMinutesToTarget?: number;
      reasoning: string;
    }>;
    
    // Convert to AutoPilotDecision format with FULL risk controls (same as single-coin path)
    const decisions: AutoPilotDecision[] = [];
    
    // Guard against zero/near-zero portfolio to prevent NaN/Infinity
    if (!portfolioUSD || portfolioUSD < 1 || !isFinite(portfolioUSD)) {
      console.log(`[AUTO-PILOT] Insufficient portfolio value ($${portfolioUSD}) - all coins set to HOLD`);
      return coins.map(coin => createHoldDecision(coin.symbol, 'Insufficient portfolio value'));
    }
    
    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i];
      const parsed_decision = parsed.find(p => p.symbol === coin.symbol) || parsed[i];
      
      if (!parsed_decision) {
        decisions.push(createHoldDecision(coin.symbol, 'No decision in batch response'));
        continue;
      }
      
      const action = parsed_decision.action?.toLowerCase() as 'buy' | 'sell' | 'hold' || 'hold';
      const confidence = Math.min(100, Math.max(0, parsed_decision.confidence || 0));
      const urgency = Math.min(10, Math.max(1, parsed_decision.urgency || 5));
      const regime = detectMarketRegime(coin.symbol, coin.priceHistory);
      
      // === DYNAMIC POSITION SIZING (MATCHING SINGLE-COIN PATH) ===
      // AI requests % of available USD (1-20% max per trade)
      const requestedPercent = Math.min(20, Math.max(1, parsed_decision.tradeAmountPercent || 10));
      
      // Apply confidence-based multiplier
      const confidenceMultiplier = 0.5 + (confidence / 200); // Range: 0.5 to 1.0
      const baseTradePercent = requestedPercent * confidenceMultiplier;
      const baseTradeAmountUSD = (portfolioUSD * baseTradePercent) / 100;
      
      console.log(`[AUTO-PILOT] ${coin.symbol}: AI requested ${requestedPercent}%, confidence ${confidence}% -> ${baseTradePercent.toFixed(2)}% = $${baseTradeAmountUSD.toFixed(2)}`);
      const dynamicSizing = calculateDynamicPositionSize(
        baseTradeAmountUSD,
        confidence,
        regime,
        coin.indicators?.atr || 0
      );
      
      // === HARD CAP ENFORCEMENT: Max 20% per single trade ===
      const maxTradeAmountUSD = portfolioUSD * 0.20; // 20% hard cap
      const cappedTradeAmountUSD = Math.min(dynamicSizing.adjustedAmount, maxTradeAmountUSD);
      const adjustedTradeAmountUSD = cappedTradeAmountUSD;
      const adjustedTradePercent = portfolioUSD > 0 ? (adjustedTradeAmountUSD / portfolioUSD) * 100 : 0;
      const wasCapped = dynamicSizing.adjustedAmount > maxTradeAmountUSD;
      
      // If dynamic sizing returned 0 (insufficient base), convert to hold
      // Also block SELL if user has no balance for this coin
      let finalAction = adjustedTradeAmountUSD <= 0 ? 'hold' : action;
      if (finalAction === 'sell' && coin.balance <= 0) {
        console.log(`[NO POSITION GATE] ${coin.symbol}: Blocked SELL in batch - user has 0 balance, converting to HOLD`);
        finalAction = 'hold';
      }
      const finalTradeAmount = adjustedTradeAmountUSD > 0 ? Math.max(5, adjustedTradeAmountUSD) : 0;
      
      console.log(`[AUTO-PILOT] ${coin.symbol}: ${action} -> Dynamic sizing: $${baseTradeAmountUSD.toFixed(2)} -> $${finalTradeAmount.toFixed(2)}${wasCapped ? ' [CAPPED at 20%]' : ''}`);
      
      // Use AI-provided settings with fallbacks (matching single-coin path)
      // Day trader thresholds: 50%+ = aggressive, 30%+ = moderate, else conservative
      const stopLossPercent = Math.min(10, Math.max(1, parsed_decision.stopLossPercent || 3));
      const takeProfitPercent = Math.min(20, Math.max(2, parsed_decision.takeProfitPercent || 5));
      const maxDrawdownPercent = Math.min(30, Math.max(5, parsed_decision.maxDrawdownPercent || 15));
      const riskLevel = parsed_decision.riskLevel || (confidence > 50 ? 'aggressive' : confidence > 30 ? 'moderate' : 'conservative');
      const strategy = parsed_decision.strategy || (regime.regime === 'trending_up' || regime.regime === 'trending_down' ? 'momentum' : 'mean_reversion');
      const marketCondition = parsed_decision.marketCondition || (regime.regime === 'trending_up' ? 'bullish' : regime.regime === 'trending_down' ? 'bearish' : regime.regime === 'volatile' ? 'volatile' : 'sideways');
      
      // Use AI's time-to-target prediction if provided, otherwise calculate it
      const aiTimeToTarget = parsed_decision.estimatedMinutesToTarget;
      const calculatedTimeToTarget = calculateTimeToTarget(
        coin.priceHistory,
        coin.price,
        takeProfitPercent,
        coin.indicators?.atr ?? undefined
      );
      // Prefer AI prediction (capped 5-1440 min), fallback to calculated
      const timeToTarget = aiTimeToTarget 
        ? Math.min(1440, Math.max(5, aiTimeToTarget)) 
        : calculatedTimeToTarget;
      
      decisions.push({
        action: finalAction,
        symbol: coin.symbol,
        tradeAmountUSD: finalTradeAmount,
        reasoning: adjustedTradeAmountUSD <= 0 
          ? `Skipping trade: ${dynamicSizing.reasoning}`
          : `${parsed_decision.reasoning || 'AI batch decision'} [Size adjusted: ${dynamicSizing.reasoning}]${aiTimeToTarget ? ` [AI predicts ${aiTimeToTarget}min to target]` : ''}`,
        confidence,
        urgency,
        strategyUsed: strategy,
        regimeDetected: regime.regime,
        positionSizeAdjusted: dynamicSizing.sizeMultiplier !== 1,
        timeToTargetMinutes: timeToTarget,
        riskAdjustedSettings: {
          stopLossPercent,
          takeProfitPercent,
          maxDrawdownPercent,
          tradeAmountPercent: Math.min(20, adjustedTradePercent), // Cap at 20% for display
          riskLevel,
          recommendedStrategy: strategy,
          shouldTrade: finalAction !== 'hold',
          reasoning: parsed_decision.reasoning || 'AI batch decision',
          confidenceLevel: confidence,
          marketCondition,
        },
      });
    }
    
    // VALIDATION PASS: Validate trades with decent confidence (>55%) - filter out low-quality setups
    const tradesToValidate = decisions.filter(d => d.action !== 'hold' && d.confidence > 55);
    
    if (tradesToValidate.length > 0) {
      console.log(`[AUTO-PILOT] Running validation for ${tradesToValidate.length} high-confidence trades...`);
      
      // Build detailed context for validation
      const validationDetails = tradesToValidate.map(d => {
        const coin = coins.find(c => c.symbol === d.symbol);
        const regime = d.regimeDetected || 'unknown';
        const rsi = coin?.indicators?.rsi?.toFixed(1) || 'N/A';
        const macd = coin?.indicators?.macdHistogram?.toFixed(6) || 'N/A';
        
        const microTrend = coin?.indicators?.microTrend?.toUpperCase() || 'N/A';
        
        return `${d.symbol}: ${d.action.toUpperCase()} $${d.tradeAmountUSD.toFixed(2)} (${d.confidence}% confidence)
  Reasoning: ${d.reasoning}
  Market Regime: ${regime}
  RSI: ${rsi} | MACD: ${macd} | Micro-Trend: ${microTrend}
  Position Size Adjusted: ${d.positionSizeAdjusted ? 'Yes' : 'No'}`;
      }).join('\n\n');
      
      const validationPrompt = `You are reviewing ${tradesToValidate.length} trading decision(s). Validate each one.

MARKET CONTEXT:
- Fear & Greed Index: ${fearGreed?.value || 'N/A'} (${fearGreed?.valueClassification || 'N/A'})
- Available USD: $${portfolioUSD.toFixed(2)}

TRADES TO VALIDATE:
${validationDetails}

VALIDATION CRITERIA:
1. Is the trade direction consistent with technical indicators (RSI, MACD)?
2. Is the confidence level justified by the market regime?
3. Are there any red flags (e.g., buying in overbought conditions, selling in oversold)?

Respond with JSON array:
[{"symbol": "COIN", "validated": true|false, "reason": "..."}]`;

      try {
        const validationResponse = await client.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: "You are a trading risk validator. Review decisions for safety. Respond with JSON array." },
            { role: "user", content: validationPrompt }
          ],
          temperature: 0.1,
          max_tokens: 1000,
        });
        
        const valContent = validationResponse?.choices?.[0]?.message?.content || '[]';
        const valMatch = valContent.match(/\[[\s\S]*\]/);
        
        if (valMatch) {
          const validations = JSON.parse(valMatch[0]) as Array<{ symbol: string; validated: boolean; reason: string }>;
          
          for (const val of validations) {
            const decisionIdx = decisions.findIndex(d => d.symbol === val.symbol);
            if (decisionIdx >= 0 && !val.validated) {
              console.log(`[AUTO-PILOT] Validation REJECTED ${val.symbol}: ${val.reason}`);
              decisions[decisionIdx] = {
                ...decisions[decisionIdx],
                action: 'hold',
                tradeAmountUSD: 0,
                reasoning: `[REJECTED] ${val.reason}`,
              };
            } else if (decisionIdx >= 0 && val.validated) {
              console.log(`[AUTO-PILOT] Validation CONFIRMED ${val.symbol}`);
              decisions[decisionIdx].reasoning += ` [VALIDATED]`;
            }
          }
        }
      } catch (valError) {
        console.log(`[AUTO-PILOT] Validation pass error:`, valError);
      }
    }
    
    console.log(`[AUTO-PILOT] Batched analysis complete: ${decisions.filter(d => d.action !== 'hold').length} trades, ${decisions.filter(d => d.action === 'hold').length} holds`);
    return decisions;
    
  } catch (error) {
    console.error('[AUTO-PILOT] Batched analysis error:', error);
    // Return hold decisions for all coins on error
    return coins.map(coin => createHoldDecision(coin.symbol, 'Batch analysis error'));
  }
}

// Helper to create a hold decision
function createHoldDecision(symbol: string, reason: string): AutoPilotDecision {
  return {
    action: 'hold',
    symbol,
    tradeAmountUSD: 0,
    reasoning: reason,
    confidence: 0,
    urgency: 1,
    strategyUsed: 'none',
    riskAdjustedSettings: {
      stopLossPercent: 5,
      takeProfitPercent: 10,
      maxDrawdownPercent: 20,
      tradeAmountPercent: 0,
      riskLevel: 'conservative',
      recommendedStrategy: 'dca',
      shouldTrade: false,
      reasoning: reason,
      confidenceLevel: 0,
      marketCondition: 'sideways',
    },
  };
}

export async function getAutoPilotMultiCoinDecisions(
  coins: { symbol: string; price: number; priceHistory: number[]; balance: number }[],
  portfolioUSD: number,
  enableQuickProfit: boolean = false,
  quickProfitPercent: number = 1.0,
  customAiEndpoint?: string | null,
  customAiModel?: string | null,
  enableSelfAwareness: boolean = true
): Promise<{ decisions: AutoPilotDecision[]; topOpportunity: AutoPilotDecision | null }> {
  const fearGreed = await fetchFearGreedIndex();
  // Use per-request custom endpoint instead of global
  const usingLocalAI = !!customAiEndpoint;
  
  // Prepare coin data with indicators
  const coinsWithIndicators = coins.map(coin => ({
    ...coin,
    indicators: calculateAllIndicators(coin.priceHistory),
    coinValueUSD: coin.balance * coin.price,
  }));
  
  let decisions: AutoPilotDecision[];
  
  // Use batched analysis for local AI (more efficient), individual for OpenAI (cached anyway)
  if (usingLocalAI && coins.length > 1) {
    console.log(`[AUTO-PILOT] Using batched analysis for ${coins.length} coins (local AI mode, ${enableQuickProfit ? 'day-trader' : 'swing-trader'} mode)`);
    decisions = await analyzeAllCoinsBatched(coinsWithIndicators, portfolioUSD, fearGreed, enableQuickProfit, quickProfitPercent, customAiEndpoint, customAiModel);
  } else {
    // Individual analysis (with caching for OpenAI)
    decisions = [];
    for (const coin of coinsWithIndicators) {
      const context: MarketContext = {
        symbol: coin.symbol,
        currentPrice: coin.price,
        priceHistory: coin.priceHistory,
        indicators: coin.indicators,
        fearGreed,
        portfolioUSD,
        coinBalance: coin.balance,
        coinValueUSD: coin.coinValueUSD,
        enableQuickProfit,
        quickProfitPercent,
        customAiEndpoint,
        customAiModel,
        enableSelfAwareness,
      };
      
      const decision = await analyzeMarketForAutoPilot(context);
      decisions.push(decision);
    }
  }
  
  const buyOpportunities = decisions.filter(d => d.action === 'buy').sort((a, b) => b.confidence - a.confidence);
  const topOpportunity = buyOpportunities.length > 0 ? buyOpportunities[0] : null;
  
  return { decisions, topOpportunity };
}
