# Replit Agent Configuration

## Overview

CryptoBot is an automated, multi-coin cryptocurrency day-trading bot for the Kraken exchange, supporting both simulated and real trading. It features a React frontend, an Express backend, and a PostgreSQL database. Key capabilities include multi-cryptocurrency support, user-configurable Kraken API keys, hot coin detection, and an AI Auto-Pilot with an aggressive day-trader mentality. The project aims to provide a powerful tool for automated, high-frequency trading.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript and Vite
- **UI**: shadcn/ui component library, Radix UI primitives, Tailwind CSS with a dark theme
- **State Management**: TanStack React Query

### Backend
- **Framework**: Express.js with TypeScript
- **API**: RESTful endpoints with Zod validation
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Replit Auth (OpenID Connect) via Passport.js
- **Trading Integration**: Kraken API for market data and trade execution

### Data Storage
- **Database**: PostgreSQL
- **Key Tables**: `users`, `sessions`, `portfolios`, `transactions`, `bot_settings`, `ai_predictions`, `global_ml_model`, `backtest_results`

### Trading Strategies & Features
- **Algorithmic**: Momentum, Mean Reversion, DCA, Grid Trading, Scalping
- **AI-Powered**: GPT-powered AI Trading and AI Auto-Pilot with day-trader mentality.
- **Fee-Aware Trading**: Dynamic calculation of Kraken fees and minimum profit targets.
- **Hot Coin Detection**: Scans and ranks cryptocurrencies based on volatility, momentum, and volume.
- **AI Auto-Pilot**: Aggressive trading prompts, volatility filters, dynamic position sizing based on AI confidence, and adaptive risk limits. Includes "Smart Model Detection" to adjust prompts based on AI model capabilities.
- **Ensemble Voting System**: Three consensus managers (momentum, mean reversion, risk manager) filter AI decisions - trades require 2/3 agreement (1/3 for scalping mode).
- **Adaptive Risk Management**: Stop-loss and take-profit adjust based on market volatility and per-symbol win rates.
- **Trailing Stop-Loss**: Automatically locks in profits by tracking the highest price (high water mark) for each position and triggering a sell when price drops a configurable percentage from the peak (default 2%).
- **Market Sentiment Integration**: Uses Fear & Greed Index from alternative.me for AI trading context.
- **Mode Switching**: Supports seamless switching between simulation and real trading, including automatic position clearing and syncing with Kraken balances/trade history.
- **Safe Sell Logic**: Prevents "Insufficient funds" errors by calculating safe sellable amounts and rounding to Kraken's precision.
- **Dust Position Detection**: Identifies and flags positions below Kraken's minimum order size.
- **Bot Trading Loop**: Background process for fetching prices, executing trades, and updating portfolios with enhanced AI context.
- **Real-Time Data**: WebSocket integration for sub-second price updates, order book streaming (10 pairs), and ticker subscriptions (19 pairs) with REST fallback.
- **Advanced Analysis**: Order Book Depth Analysis (buy/sell walls, imbalance ratios), Multi-Timeframe Confluence Scoring (1m, 5m, 1h, 4h, daily RSI/MACD/trends), and Ensemble AI Voting System for trade decisions.
- **Price Action Analysis**: Chart-like visual descriptions sent to AI including candlestick color sequences, higher-high/lower-low detection, momentum calculations, and support/resistance levels across multiple timeframes (1m, 5m, 1h).
- **Gating Logic**: Multi-layer trade protection with scalping mode overrides:
  1. **Confluence Gate**: Blocks trades when <60% timeframe alignment (10% for scalping mode)
  2. **Order Book Gate**: Blocks trades against heavy opposing pressure (>1.6x or <0.6x imbalance, relaxed for scalping)
  3. **Ensemble Gate**: Requires 2/3 AI perspectives (momentum, mean reversion, risk manager) to agree (1/3 for scalping)
- **Smart Trading Gates** (automatic when Auto-Pilot enabled):
  1. **BTC Correlation Guard**: Blocks altcoin buys when BTC is dumping >3% in 24h - altcoins typically follow BTC down
  2. **Volume Confirmation Filter**: Requires 1.2x average volume to confirm price moves are real, blocks low-volume entries
  3. **Fee-Aware Profit Gate**: Blocks trades where take-profit target is less than 3x round-trip fees (~0.52%)
  4. **Win Rate Position Sizing**: Adjusts trade size 50-125% based on per-symbol historical win rate and consecutive losses
  5. **Market Regime Detection**: Detects trending (up/down), ranging, or choppy markets using ADX-like calculations. Blocks buys in strong downtrends and choppy markets, reduces position in ranging markets with momentum strategies
  6. **Dynamic Momentum Exits**: Delays sells in profitable positions with strong upward momentum (let winners run), accelerates exits when momentum reverses
- **Advanced Scalping Mode**: Ultra-aggressive day trading profile with:
  - 10% confluence threshold (vs 60% normal)
  - 0.15% ATR anti-chop filter with strong signal override (bypass at 6+ signals)
  - Score threshold of 3 points with 1.2x ratio for trade entry
  - 1m/5m/15m/30m timeframe analysis with EMA, RSI, Bollinger, VWAP indicators
- **Chain-of-Thought Reasoning**: Explicit signal scoring, bias checks, and pre-mortem analysis in AI prompts.
- **Backtesting Engine**: Test trading strategies against historical data with:
  - Multiple strategies: **AI-Powered (GPT)**, Momentum (ROC), Mean Reversion (RSI), Scalping (EMA crossover), Combined signals
  - **AI Backtesting**: Uses GPT to analyze technical indicators (RSI, MACD, EMA, Bollinger Bands, Volume) and make trading decisions - same AI model as live trading
  - **Multi-Timeframe Analysis (MTF)**: Aggregates 5-minute candles into 1-hour and 4-hour timeframes to determine trend direction. Only allows long entries when higher timeframes are bullish aligned, blocks trades in bearish or conflicting trends.
  - Configurable AI confidence threshold (50-95%) to filter low-confidence signals
  - Deterministic results with temperature=0 for consistent backtesting
  - Signal scoring primary, AI secondary - prevents AI variance from dominating decisions
  - Entry filters: ATR volatility filter, signal score requirements, MTF alignment checks
  - Comprehensive metrics: Win rate, P/L, Sharpe ratio, max drawdown, profit factor, avg win/loss
  - Trade-by-trade analysis with equity curve tracking
  - Configurable parameters per strategy (periods, thresholds, targets)
  - Historical OHLC data from Kraken API (5-minute candles)
  - Database persistence of backtest results for comparison

## External Dependencies

### APIs and Services
- **Kraken Exchange API**: For live market data and trade execution.
- **Replit Auth**: OpenID Connect authentication.
- **alternative.me API**: For Fear & Greed Index (market sentiment).

### Database
- **PostgreSQL**: Primary data store.

### Key NPM Packages (Examples)
- `kraken-api`
- `drizzle-orm`
- `@tanstack/react-query`
- `passport`
- `ml-random-forest`