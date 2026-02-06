// @ts-ignore
import KrakenClient from 'kraken-api';
import type { TradingPair } from '@shared/schema';

// Note: Kraken API keys are now per-user only - no environment variable fallback
// Each user must configure their own API keys in Bot Settings

// Create a public API client for price fetching (no keys needed for public endpoints)
const publicKraken = new KrakenClient('', '');

// Helper to create authenticated client with user's keys
export function createUserKrakenClient(apiKey: string, secretKey: string): any {
  return new KrakenClient(apiKey, secretKey);
}

// Cache for last known prices per coin
const priceCache: Record<string, { price: number; change24h: number; timestamp: number }> = {};

// Supported trading pairs with their Kraken pair names, minimum orders, and lot decimals
// Kraken uses different naming conventions: XBT for Bitcoin, etc.
// lotDecimals: Kraken's precision for order volumes (varies by asset)
export const SUPPORTED_COINS: TradingPair[] = [
  { symbol: 'KAS', name: 'Kaspa', krakenPair: 'KASUSD', minOrder: 500, lotDecimals: 0 },
  { symbol: 'BTC', name: 'Bitcoin', krakenPair: 'XBTUSD', minOrder: 0.0001, lotDecimals: 8 },
  { symbol: 'ETH', name: 'Ethereum', krakenPair: 'ETHUSD', minOrder: 0.01, lotDecimals: 8 },
  { symbol: 'SOL', name: 'Solana', krakenPair: 'SOLUSD', minOrder: 0.1, lotDecimals: 8 },
  { symbol: 'XRP', name: 'XRP', krakenPair: 'XRPUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'DOGE', name: 'Dogecoin', krakenPair: 'DOGEUSD', minOrder: 50, lotDecimals: 0 },
  { symbol: 'ADA', name: 'Cardano', krakenPair: 'ADAUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'DOT', name: 'Polkadot', krakenPair: 'DOTUSD', minOrder: 1, lotDecimals: 8 },
  { symbol: 'LINK', name: 'Chainlink', krakenPair: 'LINKUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'AVAX', name: 'Avalanche', krakenPair: 'AVAXUSD', minOrder: 0.2, lotDecimals: 8 },
  { symbol: 'POL', name: 'Polygon', krakenPair: 'POLUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'ATOM', name: 'Cosmos', krakenPair: 'ATOMUSD', minOrder: 1, lotDecimals: 8 },
  { symbol: 'LTC', name: 'Litecoin', krakenPair: 'LTCUSD', minOrder: 0.05, lotDecimals: 8 },
  { symbol: 'UNI', name: 'Uniswap', krakenPair: 'UNIUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'SHIB', name: 'Shiba Inu', krakenPair: 'SHIBUSD', minOrder: 500000, lotDecimals: 0 },
  { symbol: 'AAVE', name: 'Aave', krakenPair: 'AAVEUSD', minOrder: 0.1, lotDecimals: 8 },
  { symbol: 'ALGO', name: 'Algorand', krakenPair: 'ALGOUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'APE', name: 'ApeCoin', krakenPair: 'APEUSD', minOrder: 1, lotDecimals: 8 },
  { symbol: 'APT', name: 'Aptos', krakenPair: 'APTUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'ARB', name: 'Arbitrum', krakenPair: 'ARBUSD', minOrder: 5, lotDecimals: 8 },
];

// Extended coin list for market-wide hot coin scanning (50+ coins)
// Legacy symbol aliases (e.g., MATIC → POL after Polygon rebrand)
export const SYMBOL_ALIASES: Record<string, string> = {
  'MATIC': 'POL',
};

// Normalize symbol (handles legacy aliases)
export function normalizeSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  return SYMBOL_ALIASES[upper] || upper;
}

export const EXTENDED_COINS: TradingPair[] = [
  ...SUPPORTED_COINS,
  // Additional popular coins for market scanning (lotDecimals: 8 for precision coins, 0 for whole-number coins)
  { symbol: 'BAT', name: 'Basic Attention', krakenPair: 'BATUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'BCH', name: 'Bitcoin Cash', krakenPair: 'BCHUSD', minOrder: 0.01, lotDecimals: 8 },
  { symbol: 'BLUR', name: 'Blur', krakenPair: 'BLURUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'COMP', name: 'Compound', krakenPair: 'COMPUSD', minOrder: 0.1, lotDecimals: 8 },
  { symbol: 'CRV', name: 'Curve', krakenPair: 'CRVUSD', minOrder: 5, lotDecimals: 8 },
  { symbol: 'ENJ', name: 'Enjin', krakenPair: 'ENJUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'EOS', name: 'EOS', krakenPair: 'EOSUSD', minOrder: 5, lotDecimals: 8 },
  { symbol: 'ETC', name: 'Ethereum Classic', krakenPair: 'ETCUSD', minOrder: 0.2, lotDecimals: 8 },
  { symbol: 'FET', name: 'Fetch.ai', krakenPair: 'FETUSD', minOrder: 5, lotDecimals: 8 },
  { symbol: 'FIL', name: 'Filecoin', krakenPair: 'FILUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'FLOW', name: 'Flow', krakenPair: 'FLOWUSD', minOrder: 5, lotDecimals: 8 },
  { symbol: 'FTM', name: 'Fantom', krakenPair: 'FTMUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'GALA', name: 'Gala', krakenPair: 'GALAUSD', minOrder: 100, lotDecimals: 0 },
  { symbol: 'GRT', name: 'The Graph', krakenPair: 'GRTUSD', minOrder: 20, lotDecimals: 0 },
  { symbol: 'ICP', name: 'Internet Computer', krakenPair: 'ICPUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'IMX', name: 'Immutable X', krakenPair: 'IMXUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'INJ', name: 'Injective', krakenPair: 'INJUSD', minOrder: 0.2, lotDecimals: 8 },
  { symbol: 'JASMY', name: 'JasmyCoin', krakenPair: 'JASMYUSD', minOrder: 100, lotDecimals: 0 },
  { symbol: 'LDO', name: 'Lido DAO', krakenPair: 'LDOUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'MANA', name: 'Decentraland', krakenPair: 'MANAUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'MKR', name: 'Maker', krakenPair: 'MKRUSD', minOrder: 0.002, lotDecimals: 8 },
  { symbol: 'NEAR', name: 'NEAR Protocol', krakenPair: 'NEARUSD', minOrder: 1, lotDecimals: 8 },
  { symbol: 'OP', name: 'Optimism', krakenPair: 'OPUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'PEPE', name: 'Pepe', krakenPair: 'PEPEUSD', minOrder: 1000000, lotDecimals: 0 },
  { symbol: 'RNDR', name: 'Render', krakenPair: 'RNDRUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'SAND', name: 'The Sandbox', krakenPair: 'SANDUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'SEI', name: 'Sei', krakenPair: 'SEIUSD', minOrder: 10, lotDecimals: 0 },
  { symbol: 'SNX', name: 'Synthetix', krakenPair: 'SNXUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'STX', name: 'Stacks', krakenPair: 'STXUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'SUI', name: 'Sui', krakenPair: 'SUIUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'TIA', name: 'Celestia', krakenPair: 'TIAUSD', minOrder: 0.5, lotDecimals: 8 },
  { symbol: 'TRX', name: 'TRON', krakenPair: 'TRXUSD', minOrder: 50, lotDecimals: 0 },
  { symbol: 'WIF', name: 'dogwifhat', krakenPair: 'WIFUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'WLD', name: 'Worldcoin', krakenPair: 'WLDUSD', minOrder: 2, lotDecimals: 8 },
  { symbol: 'XLM', name: 'Stellar', krakenPair: 'XLMUSD', minOrder: 20, lotDecimals: 0 },
  { symbol: 'XMR', name: 'Monero', krakenPair: 'XMRUSD', minOrder: 0.02, lotDecimals: 8 },
  { symbol: 'XTZ', name: 'Tezos', krakenPair: 'XTZUSD', minOrder: 5, lotDecimals: 8 },
  { symbol: 'ZEC', name: 'Zcash', krakenPair: 'ZECUSD', minOrder: 0.05, lotDecimals: 8 },
  { symbol: 'ZRX', name: '0x', krakenPair: 'ZRXUSD', minOrder: 10, lotDecimals: 0 },
];

// Market-wide scanner cache (user-agnostic raw data)
interface CachedCoinData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24hUSD: number;
  hotnessScore: number;
  volatility: number;
  momentum: number;
  volumeScore: number;
}

// Per-request result with user-specific flag
export interface MarketScanResult extends CachedCoinData {
  isInUserCoins: boolean;
}

interface MarketScanCache {
  results: CachedCoinData[];  // Cache stores raw data without user-specific flags
  timestamp: number;
  isScanning: boolean;
}

const marketScanCache: MarketScanCache = {
  results: [],
  timestamp: 0,
  isScanning: false
};

const MARKET_SCAN_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Get extended coin info
export function getExtendedCoinInfo(symbol: string): TradingPair | undefined {
  return EXTENDED_COINS.find(c => c.symbol === symbol);
}

// Fetch ticker data for extended coins (batched)
async function fetchExtendedTickerData(): Promise<Map<string, { price: number; change24h: number; volume24hUSD: number }>> {
  const results = new Map<string, { price: number; change24h: number; volume24hUSD: number }>();
  
  // Kraken supports fetching multiple tickers at once
  // Batch coins into groups to avoid rate limits
  const batchSize = 20;
  const coins = EXTENDED_COINS;
  
  for (let i = 0; i < coins.length; i += batchSize) {
    const batch = coins.slice(i, i + batchSize);
    const pairs = batch.map(c => c.krakenPair).join(',');
    
    try {
      const { result } = await publicKraken.api('Ticker', { pair: pairs });
      
      for (const coin of batch) {
        const pairData = result[coin.krakenPair] || result[Object.keys(result).find(k => k.includes(coin.symbol.toUpperCase())) || ''];
        
        if (pairData) {
          const lastPrice = parseFloat(pairData.c[0]);
          const openPrice = parseFloat(pairData.o);
          const change24h = ((lastPrice - openPrice) / openPrice) * 100;
          const volume24h = parseFloat(pairData.v[1]);
          const volume24hUSD = volume24h * lastPrice;
          
          results.set(coin.symbol, { price: lastPrice, change24h, volume24hUSD });
        }
      }
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < coins.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`Error fetching batch starting at ${i}:`, error);
    }
  }
  
  return results;
}

// Calculate hotness score for a coin
function calculateHotness(
  change24h: number,
  volume24hUSD: number,
  allVolumes: number[]
): { hotnessScore: number; volatility: number; momentum: number; volumeScore: number } {
  // Volatility: absolute price change (higher = more volatile)
  const volatility = Math.abs(change24h);
  
  // Momentum: directional price change (positive = bullish momentum)
  const momentum = change24h;
  
  // Volume score: relative to other coins (0-100), but dampened to not dominate
  const maxVolume = Math.max(...allVolumes, 1);
  const volumeScore = (volume24hUSD / maxVolume) * 100;
  
  // Combined hotness score - 24h PRICE CHANGE IS THE PRIMARY INDICATOR
  // A coin up 10% is HOT regardless of volume! Don't let BTC's massive volume drown out smaller movers
  // 24h change: 70% weight (THE KEY METRIC - this is what traders look at first!)
  // Volume: 30% weight (still matters for liquidity, but doesn't dominate)
  const changeScore = volatility * 7; // 10% change = 70 points
  const volScore = volumeScore * 0.3;  // Max 30 points from volume
  
  const hotnessScore = changeScore + volScore;
  
  return { hotnessScore, volatility, momentum, volumeScore };
}

// Helper to add user-specific flag to cached results
function addUserFlags(cachedResults: CachedCoinData[], userEnabledCoins: string[]): MarketScanResult[] {
  return cachedResults.map(r => ({
    ...r,
    isInUserCoins: userEnabledCoins.includes(r.symbol)
  }));
}

// Scan the market for hot coins
export async function scanMarketForHotCoins(
  userEnabledCoins: string[] = []
): Promise<MarketScanResult[]> {
  const now = Date.now();
  
  // Return cached results if still fresh (add user flags per-request)
  if (marketScanCache.results.length > 0 && (now - marketScanCache.timestamp) < MARKET_SCAN_CACHE_TTL) {
    return addUserFlags(marketScanCache.results, userEnabledCoins);
  }
  
  // Prevent concurrent scans - return stale cache with user flags
  if (marketScanCache.isScanning) {
    return addUserFlags(marketScanCache.results, userEnabledCoins);
  }
  
  marketScanCache.isScanning = true;
  console.log('[MARKET SCAN] Starting market-wide hot coin scan...');
  
  try {
    const tickerData = await fetchExtendedTickerData();
    const allVolumes = Array.from(tickerData.values()).map(d => d.volume24hUSD);
    
    const results: CachedCoinData[] = [];
    
    for (const coin of EXTENDED_COINS) {
      const data = tickerData.get(coin.symbol);
      if (!data) continue;
      
      const { hotnessScore, volatility, momentum, volumeScore } = calculateHotness(
        data.change24h,
        data.volume24hUSD,
        allVolumes
      );
      
      // Store only raw data without user-specific flags
      results.push({
        symbol: coin.symbol,
        name: coin.name,
        price: data.price,
        change24h: data.change24h,
        volume24hUSD: data.volume24hUSD,
        hotnessScore,
        volatility,
        momentum,
        volumeScore,
      });
    }
    
    // Sort by hotness score (highest first)
    results.sort((a, b) => b.hotnessScore - a.hotnessScore);
    
    // Cache raw results (no user-specific data)
    marketScanCache.results = results;
    marketScanCache.timestamp = now;
    
    console.log(`[MARKET SCAN] Completed! Found ${results.length} coins. Top 5: ${results.slice(0, 5).map(r => `${r.symbol}(${r.hotnessScore.toFixed(1)})`).join(', ')}`);
    
    // Return with user flags added per-request
    return addUserFlags(results, userEnabledCoins);
  } catch (error) {
    console.error('[MARKET SCAN] Error:', error);
    return addUserFlags(marketScanCache.results, userEnabledCoins);
  } finally {
    marketScanCache.isScanning = false;
  }
}

// Get top N hot coins from market scan
export async function getTopHotCoins(
  limit: number = 10,
  userEnabledCoins: string[] = []
): Promise<MarketScanResult[]> {
  const allCoins = await scanMarketForHotCoins(userEnabledCoins);
  return allCoins.slice(0, limit);
}

// Add a coin to the supported coins list (for enabling trading)
export function addCoinToSupported(symbol: string): TradingPair | null {
  // Check if already supported
  if (SUPPORTED_COINS.find(c => c.symbol === symbol)) {
    return SUPPORTED_COINS.find(c => c.symbol === symbol) || null;
  }
  
  // Find in extended coins
  const extendedCoin = EXTENDED_COINS.find(c => c.symbol === symbol);
  if (extendedCoin) {
    SUPPORTED_COINS.push(extendedCoin);
    return extendedCoin;
  }
  
  return null;
}

// Get available trading pairs
export function getAvailableCoins(): TradingPair[] {
  return SUPPORTED_COINS;
}

// Get coin info by symbol (handles legacy aliases like MATIC → POL)
export function getCoinInfo(symbol: string): TradingPair | undefined {
  const normalized = normalizeSymbol(symbol);
  return SUPPORTED_COINS.find(c => c.symbol === normalized);
}

// Get price for any supported coin
export async function getCoinPrice(symbol: string): Promise<{ price: number; change24h: number } | null> {
  const normalized = normalizeSymbol(symbol);
  const coinInfo = getCoinInfo(normalized);
  if (!coinInfo) {
    const alias = SYMBOL_ALIASES[symbol.toUpperCase()];
    if (alias) {
      console.log(`[COIN] Symbol ${symbol} was rebranded to ${alias}, using ${alias}`);
    } else {
      console.error(`Unknown coin symbol: ${symbol} (not in supported list)`);
    }
    return null;
  }

  try {
    const { result } = await publicKraken.api('Ticker', { pair: coinInfo.krakenPair });
    const pairData = result[coinInfo.krakenPair] || result[Object.keys(result)[0]];
    
    if (!pairData) {
      throw new Error(`Could not find ${coinInfo.krakenPair} in ticker results`);
    }

    const lastPrice = parseFloat(pairData.c[0]);
    const openPrice = parseFloat(pairData.o);
    const change24h = ((lastPrice - openPrice) / openPrice) * 100;

    // Cache the price
    priceCache[symbol] = { price: lastPrice, change24h, timestamp: Date.now() };
    return { price: lastPrice, change24h };
  } catch (error) {
    console.error(`Error fetching ${symbol} price from Kraken:`, error);
    // Return cached price if available and recent (within 5 minutes)
    const cached = priceCache[symbol];
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log(`Using cached ${symbol} price:`, cached.price);
      return { price: cached.price, change24h: cached.change24h };
    }
    return null;
  }
}

// Get prices for multiple coins at once
export async function getMultipleCoinPrices(symbols: string[]): Promise<Record<string, { price: number; change24h: number } | null>> {
  const results: Record<string, { price: number; change24h: number } | null> = {};
  
  // Fetch prices in parallel
  const promises = symbols.map(async (symbol) => {
    results[symbol] = await getCoinPrice(symbol);
  });
  
  await Promise.all(promises);
  return results;
}

// Get 24h volume for a coin
export async function getVolume24h(symbol: string): Promise<number | null> {
  const coinInfo = getCoinInfo(symbol);
  if (!coinInfo) {
    return null;
  }

  try {
    const { result } = await publicKraken.api('Ticker', { pair: coinInfo.krakenPair });
    const pairData = result[coinInfo.krakenPair] || result[Object.keys(result)[0]];
    
    if (!pairData) {
      return null;
    }

    // Volume is in pairData.v[1] (24h volume)
    const volume24h = parseFloat(pairData.v[1]);
    const price = parseFloat(pairData.c[0]);
    
    // Return volume in USD
    return volume24h * price;
  } catch (error) {
    console.error(`Error fetching ${symbol} volume from Kraken:`, error);
    return null;
  }
}

// Legacy function for backward compatibility
export async function getKasPrice(): Promise<{ price: number; change24h: number } | null> {
  return getCoinPrice('KAS');
}

// Get balance using user's API keys - returns simulation balance if no keys provided
export async function getBalance(userApiKey?: string | null, userSecretKey?: string | null): Promise<Record<string, number>> {
  // If no user keys provided, return simulation balance
  if (!userApiKey || !userSecretKey) {
    return { USD: 10000 };
  }

  try {
    const krakenClient = new KrakenClient(userApiKey, userSecretKey);
    const { result } = await krakenClient.api('Balance');
    const balances: Record<string, number> = {};
    
    // Map Kraken balance keys to our symbols
    const krakenToSymbol: Record<string, string> = {
      'ZUSD': 'USD', 'USD': 'USD', 'USDT': 'USD',
      'XXBT': 'BTC', 'XBT': 'BTC',
      'XETH': 'ETH', 'ETH': 'ETH',
      'KAS': 'KAS', 'XKAS': 'KAS',
      'SOL': 'SOL', 'XSOL': 'SOL',
      'XXRP': 'XRP', 'XRP': 'XRP',
      'XXDG': 'DOGE', 'DOGE': 'DOGE',
      'ADA': 'ADA', 'XADA': 'ADA',
      'DOT': 'DOT',
      'LINK': 'LINK',
      'AVAX': 'AVAX',
      'POL': 'POL',
      'ATOM': 'ATOM',
      'XLTC': 'LTC', 'LTC': 'LTC',
      'UNI': 'UNI',
      'SHIB': 'SHIB',
      'AAVE': 'AAVE',
      'ALGO': 'ALGO',
      'APE': 'APE',
      'APT': 'APT',
    };
    
    for (const [krakenKey, value] of Object.entries(result)) {
      const symbol = krakenToSymbol[krakenKey];
      if (symbol) {
        const balance = parseFloat(value as string);
        if (balance > 0) {
          balances[symbol] = (balances[symbol] || 0) + balance;
        }
      }
    }
    
    console.log("Fetched Kraken balances:", balances);
    return balances;
  } catch (error) {
    console.error("Error fetching Kraken balance:", error);
    return { USD: 0 };
  }
}

// Trade history entry from Kraken
export interface KrakenTradeEntry {
  symbol: string;
  type: 'buy' | 'sell';
  price: number;
  amount: number;
  cost: number;
  fee: number;
  timestamp: number;
  orderId: string;
}

// Map Kraken pair names back to our symbols (comprehensive mapping)
const krakenPairToSymbol: Record<string, string> = {
  // KAS
  'KASUSD': 'KAS', 'KAS/USD': 'KAS',
  // BTC - multiple Kraken formats
  'XBTUSD': 'BTC', 'XXBTZUSD': 'BTC', 'XBT/USD': 'BTC', 'XXBT': 'BTC',
  // ETH
  'ETHUSD': 'ETH', 'XETHZUSD': 'ETH', 'ETH/USD': 'ETH', 'XETH': 'ETH',
  // SOL
  'SOLUSD': 'SOL', 'SOL/USD': 'SOL',
  // XRP
  'XRPUSD': 'XRP', 'XXRPZUSD': 'XRP', 'XRP/USD': 'XRP', 'XXRP': 'XRP',
  // DOGE
  'DOGEUSD': 'DOGE', 'XDGUSD': 'DOGE', 'XXDGZUSD': 'DOGE', 'DOGE/USD': 'DOGE', 'XDG': 'DOGE',
  // ADA
  'ADAUSD': 'ADA', 'ADA/USD': 'ADA',
  // DOT
  'DOTUSD': 'DOT', 'DOT/USD': 'DOT',
  // LINK
  'LINKUSD': 'LINK', 'LINK/USD': 'LINK',
  // AVAX
  'AVAXUSD': 'AVAX', 'AVAX/USD': 'AVAX',
  // POL/MATIC
  'POLUSD': 'POL', 'MATICUSD': 'POL', 'POL/USD': 'POL', 'MATIC/USD': 'POL',
  // ATOM
  'ATOMUSD': 'ATOM', 'ATOM/USD': 'ATOM',
  // LTC
  'LTCUSD': 'LTC', 'XLTCZUSD': 'LTC', 'LTC/USD': 'LTC', 'XLTC': 'LTC',
  // UNI
  'UNIUSD': 'UNI', 'UNI/USD': 'UNI',
  // SHIB
  'SHIBUSD': 'SHIB', 'SHIB/USD': 'SHIB',
  // AAVE
  'AAVEUSD': 'AAVE', 'AAVE/USD': 'AAVE',
  // ALGO
  'ALGOUSD': 'ALGO', 'ALGO/USD': 'ALGO',
  // APE
  'APEUSD': 'APE', 'APE/USD': 'APE',
  // APT
  'APTUSD': 'APT', 'APT/USD': 'APT',
  // Additional coins
  'ARBUSD': 'ARB', 'ARB/USD': 'ARB',
  'NEARUSD': 'NEAR', 'NEAR/USD': 'NEAR',
  'OPUSD': 'OP', 'OP/USD': 'OP',
  'FILUSD': 'FIL', 'FIL/USD': 'FIL',
  'INJUSD': 'INJ', 'INJ/USD': 'INJ',
  'SUIUSD': 'SUI', 'SUI/USD': 'SUI',
  'TIAUSD': 'TIA', 'TIA/USD': 'TIA',
};

// Fetch user's trade history from Kraken
// Returns trades for the last N days (default 30)
export async function getTradesHistory(
  userApiKey: string, 
  userSecretKey: string,
  daysBack: number = 30
): Promise<KrakenTradeEntry[]> {
  try {
    const krakenClient = new KrakenClient(userApiKey, userSecretKey);
    
    // Calculate start timestamp (N days ago)
    const startTimestamp = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
    
    const { result } = await krakenClient.api('TradesHistory', {
      start: startTimestamp,
      trades: true
    });
    
    const trades: KrakenTradeEntry[] = [];
    
    if (result && result.trades) {
      for (const [tradeId, tradeData] of Object.entries(result.trades)) {
        const trade = tradeData as any;
        const pair = trade.pair as string;
        
        // Try to find matching symbol
        let symbol = krakenPairToSymbol[pair];
        
        // If not found directly, try matching with partial strings
        if (!symbol) {
          for (const [krakenPair, sym] of Object.entries(krakenPairToSymbol)) {
            if (pair.includes(krakenPair) || krakenPair.includes(pair)) {
              symbol = sym;
              break;
            }
          }
        }
        
        if (symbol) {
          trades.push({
            symbol,
            type: trade.type as 'buy' | 'sell',
            price: parseFloat(trade.price),
            amount: parseFloat(trade.vol),
            cost: parseFloat(trade.cost),
            fee: parseFloat(trade.fee),
            timestamp: Math.floor(trade.time * 1000), // Convert to milliseconds
            orderId: trade.ordertxid,
          });
        }
      }
    }
    
    // Sort by timestamp descending (most recent first)
    trades.sort((a, b) => b.timestamp - a.timestamp);
    
    console.log(`[TRADE HISTORY] Fetched ${trades.length} trades from Kraken (last ${daysBack} days)`);
    return trades;
  } catch (error) {
    console.error("Error fetching Kraken trade history:", error);
    return [];
  }
}

// Find the most recent buy trade for a specific symbol
// Used to determine entry price for pre-existing positions
export function findLastBuyTrade(trades: KrakenTradeEntry[], symbol: string): KrakenTradeEntry | null {
  // Find the most recent buy trade for this symbol
  return trades.find(t => t.symbol === symbol && t.type === 'buy') || null;
}

// Calculate weighted average entry price for a position using FIFO cost basis
// Properly accounts for sells by walking through trades chronologically
// Returns null if unable to determine a reliable entry price
export function calculateAverageEntryPrice(
  trades: KrakenTradeEntry[], 
  symbol: string, 
  currentBalance: number
): { price: number; timestamp: number; amount: number; isEstimate: boolean } | null {
  // Filter and sort trades for this symbol (oldest first for FIFO)
  const symbolTrades = trades
    .filter(t => t.symbol === symbol)
    .sort((a, b) => a.timestamp - b.timestamp); // Oldest first for FIFO
  
  if (symbolTrades.length === 0) return null;
  
  // Track lots of shares with their cost basis (FIFO approach)
  interface Lot {
    amount: number;
    price: number;
    timestamp: number;
  }
  
  const lots: Lot[] = [];
  
  // Walk through trades chronologically
  for (const trade of symbolTrades) {
    if (trade.type === 'buy') {
      // Add new lot
      lots.push({
        amount: trade.amount,
        price: trade.price,
        timestamp: trade.timestamp
      });
    } else if (trade.type === 'sell') {
      // Remove from oldest lots first (FIFO)
      let sellRemaining = trade.amount;
      while (sellRemaining > 0 && lots.length > 0) {
        const oldestLot = lots[0];
        if (oldestLot.amount <= sellRemaining) {
          // Consume entire lot
          sellRemaining -= oldestLot.amount;
          lots.shift();
        } else {
          // Partial consumption
          oldestLot.amount -= sellRemaining;
          sellRemaining = 0;
        }
      }
    }
  }
  
  // If no lots remain, we can't determine entry price from history
  if (lots.length === 0) {
    console.log(`[POSITION SYNC] ${symbol}: No remaining lots after FIFO - cannot determine entry from trade history`);
    return null;
  }
  
  // Calculate total from remaining lots
  let lotsTotal = 0;
  for (const lot of lots) {
    lotsTotal += lot.amount;
  }
  
  // Check if we have enough history to cover the current balance
  const tolerance = currentBalance * 0.05; // 5% tolerance for rounding/fees
  const hasEnoughHistory = lotsTotal >= currentBalance - tolerance;
  
  if (!hasEnoughHistory) {
    // Trade history doesn't fully explain current balance
    // This could mean: older trades outside window, deposits, staking rewards, etc.
    console.log(`[POSITION SYNC] ${symbol}: Incomplete history (lots: ${lotsTotal.toFixed(4)}, balance: ${currentBalance.toFixed(4)}) - entry may be approximate`);
  }
  
  // Trim lots to match currentBalance using FIFO (oldest lots first - consistent with FIFO accounting)
  // This gives us the cost basis for the "oldest" shares we still hold
  let remainingToAllocate = currentBalance;
  let totalCost = 0;
  let totalAmount = 0;
  let latestTimestamp = 0;
  
  // Process lots from oldest to newest (FIFO for selection)
  for (let i = 0; i < lots.length && remainingToAllocate > 0; i++) {
    const lot = lots[i];
    const useAmount = Math.min(lot.amount, remainingToAllocate);
    
    totalAmount += useAmount;
    totalCost += useAmount * lot.price;
    remainingToAllocate -= useAmount;
    
    // Track the latest timestamp for reference
    latestTimestamp = lot.timestamp;
  }
  
  if (totalAmount === 0) return null;
  
  return {
    price: totalCost / totalAmount,
    timestamp: latestTimestamp,
    amount: totalAmount,
    isEstimate: !hasEnoughHistory
  };
}

// Get lot decimals for a coin (how many decimal places Kraken accepts for order volume)
export function getLotDecimals(symbol: string): number {
  const coinInfo = getCoinInfo(symbol);
  if (!coinInfo) return 8; // Default to 8 decimal places
  return coinInfo.lotDecimals ?? 8;
}

// Round down a volume to the coin's lot precision
function roundDownToLotDecimals(volume: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  return Math.floor(volume * multiplier) / multiplier;
}

// Calculate the maximum safe sellable amount for a coin
// This accounts for:
// 1. Kraken's lot decimal precision requirements
// 2. A small safety margin to avoid "insufficient funds" errors due to fee reserves
// 3. Minimum order size validation
// 4. Progressive margin reduction to maximize sell amount while staying above minimum
export function getSafeSellableAmount(
  balance: number,
  symbol: string,
  initialMarginPercent: number = 0.5 // Start with 0.5% safety margin
): { amount: number; reason: string; canSell: boolean } {
  const coinInfo = getCoinInfo(symbol);
  if (!coinInfo) {
    return { amount: 0, reason: `Unknown coin: ${symbol}`, canSell: false };
  }

  const lotDecimals = coinInfo.lotDecimals ?? 8;
  
  // Round the balance down to lot precision first
  const roundedBalance = roundDownToLotDecimals(balance, lotDecimals);
  
  // If rounded balance is below minimum, can't sell
  if (roundedBalance < coinInfo.minOrder) {
    return { 
      amount: 0, 
      reason: `Balance ${roundedBalance} below minimum order (${coinInfo.minOrder})`, 
      canSell: false 
    };
  }
  
  // Try progressively smaller margins: 0.5%, 0.25%, 0.1%, 0.05%
  const margins = [initialMarginPercent, 0.25, 0.1, 0.05];
  
  for (const margin of margins) {
    const safeAmount = balance * (1 - margin / 100);
    const roundedAmount = roundDownToLotDecimals(safeAmount, lotDecimals);
    
    if (roundedAmount >= coinInfo.minOrder) {
      console.log(`[SAFE SELL] ${symbol}: Balance ${balance}, safe amount ${roundedAmount} (${margin}% margin, ${lotDecimals} decimals)`);
      return { 
        amount: roundedAmount, 
        reason: `Safe sell: ${roundedAmount} (${margin}% margin)`, 
        canSell: true 
      };
    }
  }
  
  // LAST RESORT: If all margin attempts failed but balance >= minimum order,
  // allow selling exactly the minimum order amount with 0% margin.
  // This is critical for honoring stop-loss orders when position size equals minimum.
  // Calculate tolerance based on lot precision - e.g., 8 decimals = 0.00000001 tolerance
  const lotTolerance = Math.pow(10, -lotDecimals) * 10; // 10x lot precision as tolerance
  const balanceDelta = roundedBalance - coinInfo.minOrder;
  
  // If balance is at or just slightly above minimum (within lot precision tolerance)
  if (roundedBalance >= coinInfo.minOrder && balanceDelta <= lotTolerance) {
    console.log(`[SAFE SELL] ${symbol}: Balance ${roundedBalance} at minimum order ${coinInfo.minOrder} (delta: ${balanceDelta.toFixed(lotDecimals)}) - selling exact minimum (0% margin)`);
    return { 
      amount: coinInfo.minOrder, 
      reason: `Selling exact minimum: ${coinInfo.minOrder} (0% margin - stop-loss priority)`, 
      canSell: true 
    };
  }
  
  // FALLBACK: If balance is above minimum but margins push below, try selling rounded balance directly
  // This handles cases where balance is slightly above min but margin rounding drops below
  if (roundedBalance >= coinInfo.minOrder) {
    console.log(`[SAFE SELL] ${symbol}: All margins failed but balance ${roundedBalance} >= min ${coinInfo.minOrder} - selling rounded balance (0% margin)`);
    return { 
      amount: roundedBalance, 
      reason: `Selling full balance: ${roundedBalance} (0% margin - margins exhausted)`, 
      canSell: true 
    };
  }
  
  // If even 0.05% margin pushes below min order, balance is too close to minimum
  // This means we can't safely sell without risking "insufficient funds"
  return { 
    amount: 0, 
    reason: `Balance ${roundedBalance} too close to minimum order (${coinInfo.minOrder}) for safe sell`, 
    canSell: false 
  };
}

// Fetch historical OHLC (candlestick) data from Kraken
// interval: 1 = 1 minute, 5 = 5 minutes, 15 = 15 minutes, 60 = 1 hour, etc.
export interface OHLCData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchHistoricalOHLC(
  symbol: string, 
  interval: number = 1, 
  since?: number
): Promise<OHLCData[]> {
  const coinInfo = getCoinInfo(symbol);
  if (!coinInfo) {
    console.error(`Unknown coin symbol for OHLC: ${symbol}`);
    return [];
  }

  try {
    const params: any = { 
      pair: coinInfo.krakenPair, 
      interval 
    };
    
    // If since is provided, use it; otherwise fetch last ~720 candles (Kraken default)
    if (since) {
      params.since = since;
    }

    const { result } = await publicKraken.api('OHLC', params);
    
    // Find the data array - Kraken returns it under the pair name
    const pairKey = Object.keys(result).find(k => k !== 'last');
    if (!pairKey || !result[pairKey]) {
      console.warn(`No OHLC data found for ${symbol}`);
      return [];
    }

    const ohlcArray = result[pairKey];
    
    // Convert Kraken format to our format
    // Kraken returns: [time, open, high, low, close, vwap, volume, count]
    const data: OHLCData[] = ohlcArray.map((candle: any[]) => ({
      timestamp: candle[0] * 1000, // Convert to milliseconds
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[6])
    }));

    console.log(`Fetched ${data.length} OHLC candles for ${symbol} (${interval}min interval)`);
    return data;
  } catch (error) {
    console.error(`Error fetching OHLC for ${symbol}:`, error);
    return [];
  }
}

// Fetch OHLC data for multiple timeframes at once
export async function fetchMultiTimeframeOHLC(symbol: string): Promise<{
  oneMin: OHLCData[];
  fiveMin: OHLCData[];
  fifteenMin: OHLCData[];
  thirtyMin: OHLCData[];
  oneHour: OHLCData[];
  fourHour: OHLCData[];
  daily: OHLCData[];
}> {
  // Fetch all timeframes in parallel
  // Kraken supports: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 minutes
  const [oneMin, fiveMin, fifteenMin, thirtyMin, oneHour, fourHour, daily] = await Promise.all([
    fetchHistoricalOHLC(symbol, 1),     // 1-minute candles
    fetchHistoricalOHLC(symbol, 5),     // 5-minute candles
    fetchHistoricalOHLC(symbol, 15),    // 15-minute candles
    fetchHistoricalOHLC(symbol, 30),    // 30-minute candles
    fetchHistoricalOHLC(symbol, 60),    // 1-hour candles
    fetchHistoricalOHLC(symbol, 240),   // 4-hour candles
    fetchHistoricalOHLC(symbol, 1440),  // Daily candles
  ]);

  return { oneMin, fiveMin, fifteenMin, thirtyMin, oneHour, fourHour, daily };
}

// Order book depth data structure
export interface OrderBookDepth {
  bids: Array<{ price: number; volume: number }>;
  asks: Array<{ price: number; volume: number }>;
  spread: number;
  spreadPercent: number;
  bidWalls: Array<{ price: number; volume: number }>;  // Large buy orders
  askWalls: Array<{ price: number; volume: number }>;  // Large sell orders
  bidDepthUSD: number;  // Total USD value of bids
  askDepthUSD: number;  // Total USD value of asks
}

// Fetch order book depth for a coin
export async function getOrderBookDepth(symbol: string, count: number = 25): Promise<OrderBookDepth | null> {
  const coinInfo = getCoinInfo(symbol);
  if (!coinInfo) {
    return null;
  }

  try {
    const { result } = await publicKraken.api('Depth', { pair: coinInfo.krakenPair, count });
    const pairKey = Object.keys(result).find(k => k !== 'last');
    
    if (!pairKey || !result[pairKey]) {
      return null;
    }

    const data = result[pairKey];
    
    // Parse bids and asks [price, volume, timestamp]
    const bids = (data.bids || []).map((b: string[]) => ({
      price: parseFloat(b[0]),
      volume: parseFloat(b[1])
    }));
    
    const asks = (data.asks || []).map((a: string[]) => ({
      price: parseFloat(a[0]),
      volume: parseFloat(a[1])
    }));

    if (bids.length === 0 || asks.length === 0) {
      console.log(`[ORDER-BOOK] ${symbol}: Empty order book - bids=${bids.length}, asks=${asks.length}`);
      return null;
    }

    // Calculate spread
    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const spread = bestAsk - bestBid;
    const midPrice = (bestBid + bestAsk) / 2;
    const spreadPercent = (spread / midPrice) * 100;
    
    // Debug log for spread calculation
    if (spreadPercent < 0.001) {
      console.log(`[ORDER-BOOK] ${symbol}: Low spread detected - bestBid=${bestBid}, bestAsk=${bestAsk}, spread=${spread}, spreadPercent=${spreadPercent.toFixed(6)}%`);
    }

    // Calculate depth in USD
    const bidDepthUSD = bids.reduce((sum: number, b: { price: number; volume: number }) => sum + (b.price * b.volume), 0);
    const askDepthUSD = asks.reduce((sum: number, a: { price: number; volume: number }) => sum + (a.price * a.volume), 0);

    // Find walls (orders > 3x average size)
    const avgBidVolume = bids.reduce((sum: number, b: { volume: number }) => sum + b.volume, 0) / bids.length;
    const avgAskVolume = asks.reduce((sum: number, a: { volume: number }) => sum + a.volume, 0) / asks.length;

    const bidWalls = bids.filter((b: { volume: number }) => b.volume > avgBidVolume * 3);
    const askWalls = asks.filter((a: { volume: number }) => a.volume > avgAskVolume * 3);

    return {
      bids: bids.slice(0, 10),
      asks: asks.slice(0, 10),
      spread,
      spreadPercent,
      bidWalls,
      askWalls,
      bidDepthUSD,
      askDepthUSD
    };
  } catch (error) {
    console.error(`Error fetching order book for ${symbol}:`, error);
    return null;
  }
}

export async function executeTrade(
  type: 'buy' | 'sell', 
  symbol: string, 
  volume: number,
  userApiKey?: string | null,
  userSecretKey?: string | null
): Promise<any> {
  const coinInfo = getCoinInfo(symbol);
  if (!coinInfo) {
    return { error: `Unknown coin: ${symbol}`, skipped: true };
  }

  // Require user's API keys - no fallback to environment variables
  if (!userApiKey || !userSecretKey) {
    console.log(`[SIMULATION] ${type.toUpperCase()} ${symbol} - Volume: ${volume} (no API keys configured)`);
    return { sim: true };
  }
  
  // Create a client instance with user's keys
  const krakenClient = new KrakenClient(userApiKey, userSecretKey);

  // Check minimum volume requirement
  if (volume < coinInfo.minOrder) {
    console.log(`[SKIPPED] ${type.toUpperCase()} ${symbol} - Volume ${volume} below Kraken minimum (${coinInfo.minOrder})`);
    return { error: 'Volume below minimum', skipped: true };
  }

  try {
    const params = {
      pair: coinInfo.krakenPair,
      type,
      ordertype: 'market',
      volume: volume.toFixed(8),
    };
    
    console.log(`Attempting Kraken ${type} for ${volume} ${symbol}`);
    
    const { result } = await krakenClient.api('AddOrder', params);
    
    // Try to get the actual fill price from the order
    let actualFillPrice: number | undefined;
    if (result?.txid && result.txid.length > 0) {
      try {
        // Wait a moment for the order to settle
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Query the order to get actual fill price
        const orderResult = await krakenClient.api('QueryOrders', {
          txid: result.txid.join(','),
          trades: true
        });
        
        if (orderResult?.result) {
          const orderInfo = Object.values(orderResult.result)[0] as any;
          if (orderInfo?.price && parseFloat(orderInfo.price) > 0) {
            actualFillPrice = parseFloat(orderInfo.price);
            console.log(`[KRAKEN] Actual fill price for ${symbol}: $${actualFillPrice} (quoted: fetching...)`);
          }
        }
      } catch (priceErr) {
        console.log(`[KRAKEN] Could not fetch fill price for ${symbol}, using quoted price`);
      }
    }
    
    return { ...result, actualFillPrice };
  } catch (error: any) {
    console.error(`Error executing ${type} on Kraken for ${symbol}:`, error.message);
    if (error.message?.includes('Insufficient funds') || 
        error.message?.includes('volume minimum not met')) {
      return { error: error.message, skipped: true };
    }
    throw error;
  }
}

// ============================================
// FEE MANAGEMENT
// ============================================

interface FeeInfo {
  makerFee: number;  // Percentage (e.g., 0.16 = 0.16%)
  takerFee: number;  // Percentage (e.g., 0.26 = 0.26%)
  volume30d: number; // 30-day volume in USD
  timestamp: number;
}

// Cache for fee rates (refreshed every 5 minutes)
let feeCache: FeeInfo | null = null;
const FEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Default fee rates if API call fails (Kraken's standard retail rates)
const DEFAULT_FEES: Omit<FeeInfo, 'timestamp'> = {
  makerFee: 0.16,
  takerFee: 0.26,
  volume30d: 0
};

// Fetch user's fee tier from Kraken - requires a kraken client with user's API keys
export async function getFeeInfo(krakenClient?: any): Promise<FeeInfo> {
  // If no client provided, return default fees
  if (!krakenClient) {
    return {
      ...DEFAULT_FEES,
      timestamp: Date.now()
    };
  }
  const client = krakenClient;
  
  // Return cached if still valid
  if (feeCache && Date.now() - feeCache.timestamp < FEE_CACHE_TTL) {
    return feeCache;
  }
  
  try {
    // TradeVolume returns fee tier based on 30-day volume
    const { result } = await client.api('TradeVolume', { pair: 'XBTUSD' });
    
    if (result) {
      const fees = result.fees?.['XXBTZUSD'] || result.fees?.[Object.keys(result.fees || {})[0]];
      const feesMaker = result.fees_maker?.['XXBTZUSD'] || result.fees_maker?.[Object.keys(result.fees_maker || {})[0]];
      
      feeCache = {
        makerFee: feesMaker?.fee ? parseFloat(feesMaker.fee) : DEFAULT_FEES.makerFee,
        takerFee: fees?.fee ? parseFloat(fees.fee) : DEFAULT_FEES.takerFee,
        volume30d: result.volume ? parseFloat(result.volume) : 0,
        timestamp: Date.now()
      };
      
      console.log(`[FEES] Kraken fee tier: Maker ${feeCache.makerFee}%, Taker ${feeCache.takerFee}% (30d volume: $${feeCache.volume30d.toFixed(2)})`);
      return feeCache;
    }
  } catch (error: any) {
    console.warn(`[FEES] Could not fetch fee tier from Kraken: ${error.message}`);
  }
  
  // Return default fees if API fails
  return {
    ...DEFAULT_FEES,
    timestamp: Date.now()
  };
}

// Get round-trip fee percentage (buy + sell)
export async function getRoundTripFeePercent(krakenClient?: any): Promise<number> {
  const fees = await getFeeInfo(krakenClient);
  // Market orders are taker fees, round-trip = 2x taker fee
  return fees.takerFee * 2;
}

// Calculate minimum profit target that exceeds fees
export async function getMinProfitTarget(krakenClient?: any): Promise<number> {
  const roundTripFee = await getRoundTripFeePercent(krakenClient);
  // Minimum profit should be fees + 20% buffer to ensure actual profit
  const minProfit = roundTripFee * 1.2;
  return Math.max(minProfit, 0.6); // At least 0.6% to cover typical fees
}

// Calculate net profit after fees
export function calculateNetProfit(grossProfitPercent: number, roundTripFeePercent: number): number {
  return grossProfitPercent - roundTripFeePercent;
}

// Check if a trade would be profitable after fees
export function isTradeWorthwhile(expectedProfitPercent: number, roundTripFeePercent: number): boolean {
  const netProfit = calculateNetProfit(expectedProfitPercent, roundTripFeePercent);
  return netProfit > 0.1; // At least 0.1% net profit after fees
}
