// Fear & Greed Index API Integration
// Fetches crypto market sentiment from alternative.me API

export interface FearGreedData {
  value: number;           // 0-100 (0 = Extreme Fear, 100 = Extreme Greed)
  valueClassification: string; // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
  timestamp: number;
  timeUntilUpdate: string;
}

interface CachedFearGreed {
  data: FearGreedData;
  fetchedAt: number;
}

let fearGreedCache: CachedFearGreed | null = null;
const CACHE_DURATION = 10 * 60 * 1000; // Cache for 10 minutes (index updates once/day)

// Fetch Fear & Greed Index from alternative.me API
export async function fetchFearGreedIndex(): Promise<FearGreedData | null> {
  // Check cache first
  if (fearGreedCache && (Date.now() - fearGreedCache.fetchedAt) < CACHE_DURATION) {
    return fearGreedCache.data;
  }
  
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1');
    
    if (!response.ok) {
      console.error('[Fear&Greed] API request failed:', response.status);
      return fearGreedCache?.data || null;
    }
    
    const json = await response.json();
    
    if (!json.data || !json.data[0]) {
      console.error('[Fear&Greed] Invalid API response');
      return fearGreedCache?.data || null;
    }
    
    const raw = json.data[0];
    const data: FearGreedData = {
      value: parseInt(raw.value, 10),
      valueClassification: raw.value_classification,
      timestamp: parseInt(raw.timestamp, 10) * 1000, // Convert to ms
      timeUntilUpdate: raw.time_until_update || 'unknown'
    };
    
    // Update cache
    fearGreedCache = {
      data,
      fetchedAt: Date.now()
    };
    
    console.log(`[Fear&Greed] Index: ${data.value} (${data.valueClassification})`);
    return data;
    
  } catch (error) {
    console.error('[Fear&Greed] Failed to fetch:', error);
    return fearGreedCache?.data || null;
  }
}

// Format Fear & Greed for AI prompt
export function formatFearGreedForAI(data: FearGreedData | null): string {
  if (!data) {
    return '- Market Sentiment: Unknown (Fear & Greed Index unavailable)';
  }
  
  let interpretation = '';
  let tradingHint = '';
  
  if (data.value <= 20) {
    interpretation = 'EXTREME FEAR - Market is very scared';
    tradingHint = 'Historically good time to buy (contrarian view: "be greedy when others are fearful")';
  } else if (data.value <= 40) {
    interpretation = 'FEAR - Market is cautious';
    tradingHint = 'Possible buying opportunity as fear may be overblown';
  } else if (data.value <= 60) {
    interpretation = 'NEUTRAL - Market is balanced';
    tradingHint = 'No clear sentiment-based signal';
  } else if (data.value <= 80) {
    interpretation = 'GREED - Market is optimistic';
    tradingHint = 'Caution advised - may be getting overheated';
  } else {
    interpretation = 'EXTREME GREED - Market is euphoric';
    tradingHint = 'High risk of correction - consider taking profits';
  }
  
  return `=== MARKET SENTIMENT ===
- Fear & Greed Index: ${data.value}/100 (${data.valueClassification.toUpperCase()})
- Interpretation: ${interpretation}
- Trading Hint: ${tradingHint}`;
}

// Get simplified sentiment for quick reference
export function getSentimentLevel(data: FearGreedData | null): 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed' | 'unknown' {
  if (!data) return 'unknown';
  if (data.value <= 20) return 'extreme_fear';
  if (data.value <= 40) return 'fear';
  if (data.value <= 60) return 'neutral';
  if (data.value <= 80) return 'greed';
  return 'extreme_greed';
}
