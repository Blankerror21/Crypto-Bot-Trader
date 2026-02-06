import { z } from 'zod';
import { insertTransactionSchema, insertBotSettingsSchema, portfolios, transactions, botSettings } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  })
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  portfolio: {
    get: {
      method: 'GET' as const,
      path: '/api/portfolio',
      responses: {
        200: z.custom<typeof portfolios.$inferSelect>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
    reset: { // Helper to reset simulation
      method: 'POST' as const,
      path: '/api/portfolio/reset',
      responses: {
        200: z.custom<typeof portfolios.$inferSelect>(),
        401: errorSchemas.unauthorized,
      }
    }
  },
  transactions: {
    list: {
      method: 'GET' as const,
      path: '/api/transactions',
      responses: {
        200: z.array(z.custom<typeof transactions.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
  },
  bot: {
    get: {
      method: 'GET' as const,
      path: '/api/bot/settings',
      responses: {
        200: z.custom<typeof botSettings.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/bot/settings',
      input: insertBotSettingsSchema.partial(),
      responses: {
        200: z.custom<typeof botSettings.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    toggle: {
      method: 'POST' as const,
      path: '/api/bot/toggle',
      input: z.object({ isActive: z.boolean() }),
      responses: {
        200: z.custom<typeof botSettings.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
  },
  market: {
    prices: {
      method: 'GET' as const,
      path: '/api/market/prices',
      responses: {
        200: z.array(z.object({
          symbol: z.string(),
          price: z.number(),
          change24h: z.number(),
        })),
      },
    },
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// ============================================
// TYPE HELPERS
// ============================================
export type PortfolioResponse = z.infer<typeof api.portfolio.get.responses[200]>;
export type TransactionListResponse = z.infer<typeof api.transactions.list.responses[200]>;
export type BotSettingsResponse = z.infer<typeof api.bot.get.responses[200]>;
export type MarketPricesResponse = z.infer<typeof api.market.prices.responses[200]>;
export type UpdateBotSettings = z.infer<typeof api.bot.update.input>;
