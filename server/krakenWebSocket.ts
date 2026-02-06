import WebSocket from 'ws';
import { SUPPORTED_COINS, EXTENDED_COINS } from './kraken';

interface PriceUpdate {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume24h: number;
  change24h: number;
  timestamp: number;
}

interface OrderBookLevel {
  price: number;
  volume: number;
}

interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

interface OrderBookAnalysis {
  symbol: string;
  bidWallPrice: number | null;
  bidWallVolume: number;
  askWallPrice: number | null;
  askWallVolume: number;
  buyPressure: number;
  sellPressure: number;
  imbalanceRatio: number;
  spreadPercent: number;
  depth10Percent: { bids: number; asks: number };
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  timestamp: number;
}

const realTimePrices: Map<string, PriceUpdate> = new Map();
const orderBooks: Map<string, OrderBookSnapshot> = new Map();
const priceUpdateCallbacks: Set<(update: PriceUpdate) => void> = new Set();

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000;
let isConnected = false;

function getKrakenWsPair(symbol: string): string {
  const pairMappings: Record<string, string> = {
    'BTC': 'XBT/USD',
    'ETH': 'ETH/USD',
    'SOL': 'SOL/USD',
    'XRP': 'XRP/USD',
    'DOGE': 'DOGE/USD',
    'ADA': 'ADA/USD',
    'DOT': 'DOT/USD',
    'LINK': 'LINK/USD',
    'AVAX': 'AVAX/USD',
    'POL': 'POL/USD',
    'ATOM': 'ATOM/USD',
    'LTC': 'LTC/USD',
    'UNI': 'UNI/USD',
    'SHIB': 'SHIB/USD',
    'AAVE': 'AAVE/USD',
    'ALGO': 'ALGO/USD',
    'APE': 'APE/USD',
    'APT': 'APT/USD',
    'KAS': 'KAS/USD',
  };
  return pairMappings[symbol] || `${symbol}/USD`;
}

function symbolFromWsPair(wsPair: string): string | null {
  const symbol = wsPair.replace('/USD', '').replace('XBT', 'BTC');
  const coinInfo = SUPPORTED_COINS.find(c => c.symbol === symbol);
  return coinInfo ? symbol : null;
}

export function connectKrakenWebSocket(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  console.log('[WS] Connecting to Kraken WebSocket...');
  ws = new WebSocket('wss://ws.kraken.com');

  ws.on('open', () => {
    console.log('[WS] Connected to Kraken WebSocket');
    isConnected = true;
    reconnectAttempts = 0;

    const pairs = SUPPORTED_COINS.map(c => getKrakenWsPair(c.symbol));
    
    const tickerSubscribe = {
      event: 'subscribe',
      pair: pairs,
      subscription: { name: 'ticker' }
    };
    ws?.send(JSON.stringify(tickerSubscribe));
    console.log(`[WS] Subscribed to ticker for ${pairs.length} pairs`);

    const bookSubscribe = {
      event: 'subscribe',
      pair: pairs.slice(0, 10),
      subscription: { name: 'book', depth: 25 }
    };
    ws?.send(JSON.stringify(bookSubscribe));
    console.log(`[WS] Subscribed to order book for top 10 pairs`);
  });

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (Array.isArray(message)) {
        const channelName = message[message.length - 2];
        const pair = message[message.length - 1];
        
        if (channelName === 'ticker') {
          handleTickerUpdate(message, pair);
        } else if (channelName.startsWith('book')) {
          handleBookUpdate(message, pair);
        }
      }
    } catch (error) {
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('[WS] WebSocket closed');
    isConnected = false;
    ws = null;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`[WS] Reconnecting in ${RECONNECT_DELAY}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(connectKrakenWebSocket, RECONNECT_DELAY);
    } else {
      console.error('[WS] Max reconnection attempts reached');
    }
  });
}

function handleTickerUpdate(message: any[], pair: string): void {
  const tickerData = message[1];
  const symbol = symbolFromWsPair(pair);
  
  if (!symbol || !tickerData) return;

  const price = parseFloat(tickerData.c?.[0] || tickerData.a?.[0] || '0');
  const bid = parseFloat(tickerData.b?.[0] || '0');
  const ask = parseFloat(tickerData.a?.[0] || '0');
  const volume24h = parseFloat(tickerData.v?.[1] || '0');
  const open24h = parseFloat(tickerData.o?.[1] || tickerData.o?.[0] || price);
  const change24h = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

  const update: PriceUpdate = {
    symbol,
    price,
    bid,
    ask,
    volume24h,
    change24h,
    timestamp: Date.now()
  };

  realTimePrices.set(symbol, update);

  priceUpdateCallbacks.forEach(callback => {
    try {
      callback(update);
    } catch (e) {
    }
  });
}

function handleBookUpdate(message: any[], pair: string): void {
  const symbol = symbolFromWsPair(pair);
  if (!symbol) return;

  const bookData = message[1];
  if (!bookData) return;

  let snapshot = orderBooks.get(symbol) || {
    symbol,
    bids: [],
    asks: [],
    timestamp: Date.now()
  };

  if (bookData.bs || bookData.as) {
    snapshot.bids = (bookData.bs || []).map((level: string[]) => ({
      price: parseFloat(level[0]),
      volume: parseFloat(level[1])
    }));
    snapshot.asks = (bookData.as || []).map((level: string[]) => ({
      price: parseFloat(level[0]),
      volume: parseFloat(level[1])
    }));
  }

  if (bookData.b) {
    bookData.b.forEach((update: string[]) => {
      const price = parseFloat(update[0]);
      const volume = parseFloat(update[1]);
      
      if (volume === 0) {
        snapshot.bids = snapshot.bids.filter(b => b.price !== price);
      } else {
        const existing = snapshot.bids.findIndex(b => b.price === price);
        if (existing >= 0) {
          snapshot.bids[existing].volume = volume;
        } else {
          snapshot.bids.push({ price, volume });
          snapshot.bids.sort((a, b) => b.price - a.price);
          snapshot.bids = snapshot.bids.slice(0, 25);
        }
      }
    });
  }

  if (bookData.a) {
    bookData.a.forEach((update: string[]) => {
      const price = parseFloat(update[0]);
      const volume = parseFloat(update[1]);
      
      if (volume === 0) {
        snapshot.asks = snapshot.asks.filter(a => a.price !== price);
      } else {
        const existing = snapshot.asks.findIndex(a => a.price === price);
        if (existing >= 0) {
          snapshot.asks[existing].volume = volume;
        } else {
          snapshot.asks.push({ price, volume });
          snapshot.asks.sort((a, b) => a.price - b.price);
          snapshot.asks = snapshot.asks.slice(0, 25);
        }
      }
    });
  }

  snapshot.timestamp = Date.now();
  orderBooks.set(symbol, snapshot);
}

export function getRealTimePrice(symbol: string): PriceUpdate | null {
  return realTimePrices.get(symbol) || null;
}

export function getOrderBook(symbol: string): OrderBookSnapshot | null {
  return orderBooks.get(symbol) || null;
}

export function analyzeOrderBook(symbol: string): OrderBookAnalysis | null {
  const book = orderBooks.get(symbol);
  const priceData = realTimePrices.get(symbol);
  
  if (!book || !priceData || book.bids.length === 0 || book.asks.length === 0) {
    return null;
  }

  const currentPrice = priceData.price;
  
  const totalBidVolume = book.bids.reduce((sum, b) => sum + b.volume * b.price, 0);
  const totalAskVolume = book.asks.reduce((sum, a) => sum + a.volume * a.price, 0);

  let bidWall: OrderBookLevel | null = null;
  let askWall: OrderBookLevel | null = null;
  const avgBidVolume = totalBidVolume / book.bids.length;
  const avgAskVolume = totalAskVolume / book.asks.length;

  for (const bid of book.bids) {
    const volumeUSD = bid.volume * bid.price;
    if (volumeUSD > avgBidVolume * 3 && (!bidWall || volumeUSD > bidWall.volume * bidWall.price)) {
      bidWall = bid;
    }
  }

  for (const ask of book.asks) {
    const volumeUSD = ask.volume * ask.price;
    if (volumeUSD > avgAskVolume * 3 && (!askWall || volumeUSD > askWall.volume * askWall.price)) {
      askWall = ask;
    }
  }

  const bestBid = book.bids[0]?.price || 0;
  const bestAsk = book.asks[0]?.price || 0;
  const spreadPercent = bestBid > 0 ? ((bestAsk - bestBid) / bestBid) * 100 : 0;

  const depth10Bid = book.bids
    .filter(b => b.price >= currentPrice * 0.9)
    .reduce((sum, b) => sum + b.volume * b.price, 0);
  const depth10Ask = book.asks
    .filter(a => a.price <= currentPrice * 1.1)
    .reduce((sum, a) => sum + a.volume * a.price, 0);

  const imbalanceRatio = totalAskVolume > 0 ? totalBidVolume / totalAskVolume : 1;

  let signal: OrderBookAnalysis['signal'] = 'neutral';
  if (imbalanceRatio > 2) signal = 'strong_buy';
  else if (imbalanceRatio > 1.3) signal = 'buy';
  else if (imbalanceRatio < 0.5) signal = 'strong_sell';
  else if (imbalanceRatio < 0.77) signal = 'sell';

  return {
    symbol,
    bidWallPrice: bidWall?.price || null,
    bidWallVolume: bidWall ? bidWall.volume * bidWall.price : 0,
    askWallPrice: askWall?.price || null,
    askWallVolume: askWall ? askWall.volume * askWall.price : 0,
    buyPressure: totalBidVolume,
    sellPressure: totalAskVolume,
    imbalanceRatio,
    spreadPercent,
    depth10Percent: { bids: depth10Bid, asks: depth10Ask },
    signal,
    timestamp: Date.now()
  };
}

export function onPriceUpdate(callback: (update: PriceUpdate) => void): () => void {
  priceUpdateCallbacks.add(callback);
  return () => priceUpdateCallbacks.delete(callback);
}

export function isWebSocketConnected(): boolean {
  return isConnected;
}

export function disconnectWebSocket(): void {
  if (ws) {
    ws.close();
    ws = null;
    isConnected = false;
  }
}

export function getWebSocketStats(): {
  connected: boolean;
  pricesTracked: number;
  orderBooksTracked: number;
  reconnectAttempts: number;
} {
  return {
    connected: isConnected,
    pricesTracked: realTimePrices.size,
    orderBooksTracked: orderBooks.size,
    reconnectAttempts
  };
}
