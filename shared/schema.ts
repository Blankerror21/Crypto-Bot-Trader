import { pgTable, text, serial, integer, boolean, timestamp, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  usdBalance: numeric("usd_balance").notNull().default("10000"),
  kasBalance: numeric("kas_balance").notNull().default("0"),
  totalValue: numeric("total_value").notNull().default("10000"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Coin-specific balances for multi-coin support
export const coinBalances = pgTable("coin_balances", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  symbol: varchar("symbol", { length: 20 }).notNull(), // 'BTC', 'ETH', 'KAS', etc.
  balance: numeric("balance").notNull().default("0"),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Enabled coins per user
export const enabledCoins = pgTable("enabled_coins", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  krakenPair: varchar("kraken_pair", { length: 20 }).notNull(), // e.g., 'KASUSD', 'XBTUSD'
  tradeAmount: numeric("trade_amount").default("100"), // Per-coin trade amount in USD
  isEnabled: boolean("is_enabled").default(true),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 10 }).notNull(), // 'buy' or 'sell'
  symbol: varchar("symbol", { length: 20 }).notNull(), // 'KAS', 'BTC', 'ETH', etc.
  amount: numeric("amount").notNull(),
  price: numeric("price").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  isActive: boolean("is_active").default(false),
  strategy: varchar("strategy").default("simple_momentum"),
  riskLevel: varchar("risk_level").default("medium"), // low, medium, high
  tradeAmount: numeric("trade_amount").default("100"), // Default amount in USD to trade per action
  isSimulation: boolean("is_simulation").default(true),
  sessionStartedAt: timestamp("session_started_at"), // When bot was last activated
  sessionStartValue: numeric("session_start_value"), // Portfolio value when session started (for max drawdown)
  useAdaptiveTrading: boolean("use_adaptive_trading").default(false), // Enable adaptive trade sizing
  baseTradePercent: numeric("base_trade_percent").default("5"), // Base trade as % of available USD
  minTradeAmount: numeric("min_trade_amount").default("10"), // Minimum trade in USD
  maxTradeAmount: numeric("max_trade_amount").default("500"), // Maximum trade in USD
  // Risk management settings
  stopLossPercent: numeric("stop_loss_percent").default("2"), // Stop-loss percentage (day-trading: 2%)
  takeProfitPercent: numeric("take_profit_percent").default("10"), // Take-profit percentage
  // Day-trading: Quick profit-taking settings
  enableQuickProfit: boolean("enable_quick_profit").default(false), // Enable quick profit-taking
  quickProfitPercent: numeric("quick_profit_percent").default("0.5"), // Quick profit target (day-trading: 0.5-1%)
  maxDrawdownPercent: numeric("max_drawdown_percent").default("20"), // Max drawdown before pausing
  enableStopLoss: boolean("enable_stop_loss").default(false),
  enableTakeProfit: boolean("enable_take_profit").default(false),
  enableMaxDrawdown: boolean("enable_max_drawdown").default(false),
  // AI Auto-Pilot settings - Full AI autonomy mode
  enableAutoPilot: boolean("enable_auto_pilot").default(false), // Enable full AI control
  autoPilotStartedAt: timestamp("auto_pilot_started_at"), // When auto-pilot was activated
  // Custom AI endpoint for LM Studio or other OpenAI-compatible servers
  customAiEndpoint: varchar("custom_ai_endpoint"), // e.g., "http://192.168.1.100:1234/v1"
  customAiModel: varchar("custom_ai_model"), // e.g., "gpt-oss-20b" or leave blank for default
  // Trading loop interval in seconds
  loopInterval: integer("loop_interval").default(10), // Default 10 seconds
  // User's own Kraken API keys for trading with their personal account
  krakenApiKey: varchar("kraken_api_key"), // User's Kraken API key
  krakenSecretKey: varchar("kraken_secret_key"), // User's Kraken secret key
  // Hot Coin Focus Mode - only trade the top 3 hottest coins each cycle
  focusOnHotCoins: boolean("focus_on_hot_coins").default(false),
  // Global emergency stop - pauses ALL trading across all instances
  globalTradingPaused: boolean("global_trading_paused").default(false),
  // Trailing stop-loss - locks in profits as price rises
  enableTrailingStop: boolean("enable_trailing_stop").default(false),
  trailingStopPercent: numeric("trailing_stop_percent").default("2"), // Trail distance (2% default)
  // AI Self-Awareness - shows AI its past prediction accuracy (may cause conservative clustering)
  enableSelfAwareness: boolean("enable_self_awareness").default(true),
  // Structured Output Mode - uses JSON schema to speed up local LLM responses
  useStructuredOutput: boolean("use_structured_output").default(false),
  // Gate Threshold Settings - Control how restrictive the safety gates are
  confluenceThreshold: integer("confluence_threshold").default(60), // Minimum % of timeframes that must align (default 60%)
  orderBookBuyThreshold: numeric("order_book_buy_threshold").default("0.6"), // Block buys if imbalance below this (default 0.6x)
  orderBookSellThreshold: numeric("order_book_sell_threshold").default("1.6"), // Block sells if imbalance above this (default 1.6x)
  ensembleMinAgree: integer("ensemble_min_agree").default(2), // Minimum AI perspectives that must agree (default 2 of 3)
  momentumThreshold: numeric("momentum_threshold").default("8"), // 24h % change to trigger momentum injection (default 8%)
  // === SCALPING STRATEGY SETTINGS ===
  enableScalpingMode: boolean("enable_scalping_mode").default(false), // Master switch for scalping strategy
  scalpingTargetPercent: numeric("scalping_target_percent").default("0.5"), // Quick profit target (0.3-1%)
  scalpingStopPercent: numeric("scalping_stop_percent").default("0.3"), // Tight stop-loss (0.2-0.5%)
  scalpingTrailingPercent: numeric("scalping_trailing_percent").default("0.2"), // Micro trailing stop
  scalpingTimeoutMinutes: integer("scalping_timeout_minutes").default(15), // Exit if no profit in X minutes
  scalpingMinSpread: numeric("scalping_min_spread").default("0.1"), // Max spread % to enter (lower = tighter)
  scalpingVolumeMultiplier: numeric("scalping_volume_multiplier").default("1.5"), // Required volume spike
  scalpingOrderBookImbalance: numeric("scalping_order_book_imbalance").default("1.3"), // Min buy/sell ratio
  scalpingEmaFast: integer("scalping_ema_fast").default(9), // Fast EMA period
  scalpingEmaSlow: integer("scalping_ema_slow").default(21), // Slow EMA period
  scalpingRsiOversold: integer("scalping_rsi_oversold").default(30), // RSI oversold threshold
  scalpingRsiOverbought: integer("scalping_rsi_overbought").default(70), // RSI overbought threshold
  scalpingBollingerPeriod: integer("scalping_bollinger_period").default(20), // Bollinger Band period
  scalpingBollingerStd: numeric("scalping_bollinger_std").default("2"), // Bollinger Band std dev
  scalpingUseVwap: boolean("scalping_use_vwap").default(true), // Use VWAP for entry signals
  scalpingAntiChopAtr: numeric("scalping_anti_chop_atr").default("0.10"), // Min ATR % to avoid choppy markets (aggressive default for scalping)
  scalpingMaxConcurrentTrades: integer("scalping_max_concurrent_trades").default(3), // Max simultaneous scalp positions
});

// Trade performance tracking - records completed trades with P/L
export const tradePerformance = pgTable("trade_performance", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  entryPrice: numeric("entry_price").notNull(),
  exitPrice: numeric("exit_price"),
  entryAmount: numeric("entry_amount").notNull(), // Coin amount
  entryValue: numeric("entry_value").notNull(), // USD value at entry
  exitValue: numeric("exit_value"), // USD value at exit
  profitLoss: numeric("profit_loss"), // USD profit/loss
  profitLossPercent: numeric("profit_loss_percent"), // Percentage gain/loss
  strategyUsed: varchar("strategy_used", { length: 50 }),
  aiStrategy: varchar("ai_strategy", { length: 50 }), // What AI approach was used
  entryTimestamp: timestamp("entry_timestamp").defaultNow(),
  exitTimestamp: timestamp("exit_timestamp"),
  status: varchar("status", { length: 20 }).default("open"), // open, closed, stopped
  stopLossTriggered: boolean("stop_loss_triggered").default(false),
  takeProfitTriggered: boolean("take_profit_triggered").default(false),
});

// Session performance summary
export const sessionPerformance = pgTable("session_performance", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionStartedAt: timestamp("session_started_at").notNull(),
  sessionEndedAt: timestamp("session_ended_at"),
  startingBalance: numeric("starting_balance").notNull(),
  endingBalance: numeric("ending_balance"),
  totalTrades: integer("total_trades").default(0),
  winningTrades: integer("winning_trades").default(0),
  losingTrades: integer("losing_trades").default(0),
  totalProfitLoss: numeric("total_profit_loss").default("0"),
  bestTrade: numeric("best_trade"), // Best single trade P/L
  worstTrade: numeric("worst_trade"), // Worst single trade P/L
  maxDrawdown: numeric("max_drawdown"), // Maximum drawdown during session
  isActive: boolean("is_active").default(true),
});

// AI Predictions - Track AI prediction accuracy
export const aiPredictions = pgTable("ai_predictions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  predictedDirection: varchar("predicted_direction", { length: 10 }).notNull(), // 'up', 'down', 'hold'
  confidence: integer("confidence").notNull(), // 0-100
  priceAtPrediction: numeric("price_at_prediction").notNull(),
  predictionTimestamp: timestamp("prediction_timestamp").defaultNow(),
  // Outcome tracking (filled in after check interval)
  priceAtCheck: numeric("price_at_check"),
  actualDirection: varchar("actual_direction", { length: 10 }), // 'up', 'down', 'flat'
  wasCorrect: boolean("was_correct"),
  priceChangePercent: numeric("price_change_percent"),
  checkedAt: timestamp("checked_at"),
  checkIntervalMinutes: integer("check_interval_minutes").default(10), // How long after prediction we checked
});

// === BACKTESTING TABLES ===

export const backtestResults = pgTable("backtest_results", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(), // User-friendly name for this backtest
  symbol: varchar("symbol", { length: 20 }).notNull(),
  strategy: varchar("strategy", { length: 50 }).notNull(),
  // Time range
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  // Configuration used
  configJson: text("config_json").notNull(), // JSON of all settings used
  // Performance metrics
  startingBalance: numeric("starting_balance").notNull(),
  endingBalance: numeric("ending_balance").notNull(),
  totalTrades: integer("total_trades").notNull(),
  winningTrades: integer("winning_trades").notNull(),
  losingTrades: integer("losing_trades").notNull(),
  winRate: numeric("win_rate").notNull(), // Percentage
  totalProfitLoss: numeric("total_profit_loss").notNull(),
  totalProfitLossPercent: numeric("total_profit_loss_percent").notNull(),
  maxDrawdown: numeric("max_drawdown").notNull(), // Maximum peak-to-trough decline
  maxDrawdownPercent: numeric("max_drawdown_percent").notNull(),
  sharpeRatio: numeric("sharpe_ratio"), // Risk-adjusted return
  profitFactor: numeric("profit_factor"), // Gross profit / Gross loss
  avgWin: numeric("avg_win"), // Average winning trade
  avgLoss: numeric("avg_loss"), // Average losing trade
  largestWin: numeric("largest_win"),
  largestLoss: numeric("largest_loss"),
  avgHoldingTimeMinutes: integer("avg_holding_time_minutes"),
  // Trade log
  tradesJson: text("trades_json"), // JSON array of all simulated trades
  // Equity curve for charting
  equityCurveJson: text("equity_curve_json"), // JSON array of {timestamp, equity} points
  createdAt: timestamp("created_at").defaultNow(),
});

// === CHAT INTEGRATION TABLES ===
// Used by the Replit chat integration (not currently active in this trading bot)

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === SCHEMAS ===

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({ id: true, lastUpdated: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, timestamp: true });
export const insertBotSettingsSchema = createInsertSchema(botSettings).omit({ id: true });
export const insertCoinBalanceSchema = createInsertSchema(coinBalances).omit({ id: true, lastUpdated: true });
export const insertEnabledCoinSchema = createInsertSchema(enabledCoins).omit({ id: true });
export const insertTradePerformanceSchema = createInsertSchema(tradePerformance).omit({ id: true, entryTimestamp: true });
export const insertSessionPerformanceSchema = createInsertSchema(sessionPerformance).omit({ id: true });
export const insertAiPredictionSchema = createInsertSchema(aiPredictions).omit({ id: true, predictionTimestamp: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertBacktestResultSchema = createInsertSchema(backtestResults).omit({ id: true, createdAt: true });

// === TYPES ===

export type Portfolio = typeof portfolios.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type BotSettings = typeof botSettings.$inferSelect;
export type CoinBalance = typeof coinBalances.$inferSelect;
export type EnabledCoin = typeof enabledCoins.$inferSelect;
export type TradePerformance = typeof tradePerformance.$inferSelect;
export type SessionPerformance = typeof sessionPerformance.$inferSelect;
export type AiPrediction = typeof aiPredictions.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type UpdateBotSettings = Partial<z.infer<typeof insertBotSettingsSchema>>;
export type InsertEnabledCoin = z.infer<typeof insertEnabledCoinSchema>;
export type InsertTradePerformance = z.infer<typeof insertTradePerformanceSchema>;
export type InsertSessionPerformance = z.infer<typeof insertSessionPerformanceSchema>;
export type InsertAiPrediction = z.infer<typeof insertAiPredictionSchema>;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type BacktestResult = typeof backtestResults.$inferSelect;
export type InsertBacktestResult = z.infer<typeof insertBacktestResultSchema>;

export interface MarketPrice {
  symbol: string;
  price: number;
  change24h: number;
}

// Available trading pair from Kraken
export interface TradingPair {
  symbol: string;       // e.g., 'BTC', 'ETH', 'KAS'
  name: string;         // e.g., 'Bitcoin', 'Ethereum', 'Kaspa'
  krakenPair: string;   // e.g., 'XBTUSD', 'ETHUSD', 'KASUSD'
  minOrder: number;     // Minimum order volume
  lotDecimals?: number; // Number of decimal places for order volume (default: 8)
}
