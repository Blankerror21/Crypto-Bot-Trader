import { analyzeOrderBook } from './krakenWebSocket';
import { calculateConfluence, getConfluenceForAI } from './confluenceAnalysis';

export interface AIVote {
  perspective: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reasoning: string;
}

export interface EnsembleDecision {
  symbol: string;
  finalAction: 'buy' | 'sell' | 'hold';
  consensusConfidence: number;
  votes: AIVote[];
  agreementLevel: number;
  orderBookSignal: string | null;
  confluenceSignal: string | null;
  recommendation: string;
  shouldExecute: boolean;
  timestamp: number;
}

interface MarketContext {
  price: number;
  change24h: number;
  volatility: number;
  volume: number;
  rsi?: number;
  macd?: { histogram: number };
  trendDirection?: 'up' | 'down' | 'sideways';
}

export function generateEnsemblePerspectives(
  symbol: string,
  context: MarketContext
): string[] {
  const perspectives: string[] = [];
  
  // Determine if 24h change is significant
  const is24hStrong = Math.abs(context.change24h) >= 5;
  const is24hMassive = Math.abs(context.change24h) >= 8;
  const change24hEmphasis = is24hMassive 
    ? `*** THIS COIN ${context.change24h > 0 ? 'PUMPED' : 'DUMPED'} ${Math.abs(context.change24h).toFixed(1)}% in 24h - MAJOR MOVE! ***`
    : is24hStrong
    ? `** Strong ${context.change24h > 0 ? 'gain' : 'drop'}: ${Math.abs(context.change24h).toFixed(1)}% in 24h **`
    : `24h move: ${context.change24h >= 0 ? '+' : ''}${context.change24h.toFixed(2)}%`;
  
  const momentumBias = is24hMassive && context.change24h > 0 
    ? 'This is a HOT coin today! A +8%+ daily pump is a STRONG bullish signal. Vote BUY to ride the momentum unless RSI is extremely overbought (>85)!' 
    : is24hStrong && context.change24h > 0
    ? 'Strong 24h performance suggests bullish momentum. Lean toward BUY if other signals confirm.'
    : 'Look for continuation or reversal signals.';
  
  perspectives.push(`You are a MOMENTUM TRADER. Focus on trend strength, volume confirmation, and breakout patterns. ${change24hEmphasis}. ${momentumBias}. REMEMBER: Daily moves carry more weight than short-term noise.`);
  
  const meanRevBias = is24hMassive && context.change24h < 0
    ? 'This coin crashed hard - look for oversold bounce opportunities!'
    : is24hMassive && context.change24h > 0
    ? 'Big pump today - watch for exhaustion but do not fight strong momentum.'
    : 'Look for rubber-band snap-back opportunities.';
  
  perspectives.push(`You are a MEAN REVERSION TRADER. Focus on oversold/overbought conditions and price extremes. ${context.rsi ? `Current RSI: ${context.rsi.toFixed(0)}` : 'Analyze if price is extended'}. ${meanRevBias}`);
  
  const riskBias = is24hMassive && context.change24h > 0
    ? 'Big pump today - momentum is on our side. Acceptable risk to BUY with tight stop-loss. Do not miss the move!'
    : is24hMassive && context.change24h < 0
    ? 'Big dump today - high risk environment. Be very cautious or wait for stabilization.'
    : 'Evaluate risk/reward ratio, stop-loss placement, and position sizing. Be conservative.';
  
  perspectives.push(`You are a RISK MANAGER. Focus on protecting capital and managing downside. Volatility: ${context.volatility.toFixed(2)}%. ${change24hEmphasis}. ${riskBias}`);
  
  return perspectives;
}

export function aggregateVotes(votes: AIVote[]): {
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  agreementLevel: number;
} {
  if (votes.length === 0) {
    return { action: 'hold', confidence: 0, agreementLevel: 0 };
  }
  
  const actionCounts = {
    buy: { count: 0, totalConfidence: 0 },
    sell: { count: 0, totalConfidence: 0 },
    hold: { count: 0, totalConfidence: 0 }
  };
  
  for (const vote of votes) {
    actionCounts[vote.action].count++;
    actionCounts[vote.action].totalConfidence += vote.confidence;
  }
  
  let winningAction: 'buy' | 'sell' | 'hold' = 'hold';
  let maxScore = 0;
  
  for (const [action, data] of Object.entries(actionCounts)) {
    const score = data.count * 100 + data.totalConfidence;
    if (score > maxScore) {
      maxScore = score;
      winningAction = action as 'buy' | 'sell' | 'hold';
    }
  }
  
  const agreementLevel = (actionCounts[winningAction].count / votes.length) * 100;
  
  const avgConfidence = actionCounts[winningAction].count > 0
    ? actionCounts[winningAction].totalConfidence / actionCounts[winningAction].count
    : 0;
  
  const consensusBonus = agreementLevel >= 100 ? 10 : agreementLevel >= 66 ? 5 : 0;
  const finalConfidence = Math.min(100, avgConfidence + consensusBonus);
  
  return {
    action: winningAction,
    confidence: finalConfidence,
    agreementLevel
  };
}

export function createEnsembleDecision(
  symbol: string,
  votes: AIVote[],
  orderBookAnalysis: ReturnType<typeof analyzeOrderBook> | null,
  confluenceResult: ReturnType<typeof calculateConfluence> | null
): EnsembleDecision {
  const { action, confidence, agreementLevel } = aggregateVotes(votes);
  
  let orderBookSignal: string | null = null;
  let orderBookBoost = 0;
  
  if (orderBookAnalysis) {
    orderBookSignal = `Order Book: ${orderBookAnalysis.signal.toUpperCase()} (imbalance: ${orderBookAnalysis.imbalanceRatio.toFixed(2)}, spread: ${orderBookAnalysis.spreadPercent.toFixed(3)}%)`;
    
    if (action === 'buy' && (orderBookAnalysis.signal === 'buy' || orderBookAnalysis.signal === 'strong_buy')) {
      orderBookBoost = orderBookAnalysis.signal === 'strong_buy' ? 8 : 4;
    } else if (action === 'sell' && (orderBookAnalysis.signal === 'sell' || orderBookAnalysis.signal === 'strong_sell')) {
      orderBookBoost = orderBookAnalysis.signal === 'strong_sell' ? 8 : 4;
    } else if (
      (action === 'buy' && (orderBookAnalysis.signal === 'sell' || orderBookAnalysis.signal === 'strong_sell')) ||
      (action === 'sell' && (orderBookAnalysis.signal === 'buy' || orderBookAnalysis.signal === 'strong_buy'))
    ) {
      orderBookBoost = -10;
    }
  }
  
  let confluenceSignal: string | null = null;
  let confluenceBoost = 0;
  
  if (confluenceResult) {
    confluenceSignal = confluenceResult.recommendation;
    
    if (action === 'buy' && (confluenceResult.overallSignal === 'buy' || confluenceResult.overallSignal === 'strong_buy')) {
      confluenceBoost = confluenceResult.overallSignal === 'strong_buy' ? 10 : 5;
    } else if (action === 'sell' && (confluenceResult.overallSignal === 'sell' || confluenceResult.overallSignal === 'strong_sell')) {
      confluenceBoost = confluenceResult.overallSignal === 'strong_sell' ? 10 : 5;
    } else if (
      (action === 'buy' && (confluenceResult.overallSignal === 'sell' || confluenceResult.overallSignal === 'strong_sell')) ||
      (action === 'sell' && (confluenceResult.overallSignal === 'buy' || confluenceResult.overallSignal === 'strong_buy'))
    ) {
      confluenceBoost = -15;
    }
  }
  
  const finalConfidence = Math.max(0, Math.min(100, confidence + orderBookBoost + confluenceBoost));
  
  const shouldExecute = 
    action !== 'hold' && 
    finalConfidence >= 55 && 
    agreementLevel >= 66;
  
  let recommendation: string;
  if (shouldExecute) {
    recommendation = `EXECUTE ${action.toUpperCase()} with ${finalConfidence.toFixed(0)}% confidence. ${agreementLevel.toFixed(0)}% AI agreement.`;
  } else if (action !== 'hold' && finalConfidence >= 50) {
    recommendation = `CONSIDER ${action.toUpperCase()} but confidence (${finalConfidence.toFixed(0)}%) or agreement (${agreementLevel.toFixed(0)}%) below threshold.`;
  } else {
    recommendation = `HOLD - Insufficient consensus or confidence for ${symbol}.`;
  }
  
  if (orderBookBoost !== 0) {
    recommendation += ` Order book ${orderBookBoost > 0 ? 'confirms' : 'contradicts'} signal.`;
  }
  if (confluenceBoost !== 0) {
    recommendation += ` Timeframe confluence ${confluenceBoost > 0 ? 'confirms' : 'contradicts'} signal.`;
  }
  
  return {
    symbol,
    finalAction: action,
    consensusConfidence: finalConfidence,
    votes,
    agreementLevel,
    orderBookSignal,
    confluenceSignal,
    recommendation,
    shouldExecute,
    timestamp: Date.now()
  };
}

export function formatEnsembleForAI(decision: EnsembleDecision): string {
  const votesSummary = decision.votes
    .map(v => `${v.perspective}: ${v.action.toUpperCase()} (${v.confidence}%)`)
    .join('; ');
  
  let result = `Ensemble Analysis: ${decision.votes.length} perspectives voted - ${decision.finalAction.toUpperCase()} with ${decision.consensusConfidence.toFixed(0)}% consensus, ${decision.agreementLevel.toFixed(0)}% agreement.`;
  
  if (decision.orderBookSignal) {
    result += ` ${decision.orderBookSignal}`;
  }
  
  if (decision.confluenceSignal) {
    result += ` Confluence: ${decision.confluenceSignal}`;
  }
  
  return result;
}
