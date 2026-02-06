import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type UpdateBotSettings } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import type { TradingPair, EnabledCoin } from "@shared/schema";

export function useBotSettings() {
  return useQuery({
    queryKey: [api.bot.get.path],
    queryFn: async () => {
      const res = await fetch(api.bot.get.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null;
        throw new Error("Failed to fetch bot settings");
      }
      return api.bot.get.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateBotSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: UpdateBotSettings) => {
      const res = await fetch(api.bot.update.path, {
        method: api.bot.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return api.bot.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bot.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.portfolio.get.path] });
      toast({
        title: "Configuration Saved",
        description: "Bot strategy and risk levels updated.",
      });
    },
  });
}

export function useToggleBot() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await fetch(api.bot.toggle.path, {
        method: api.bot.toggle.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to toggle bot");
      return api.bot.toggle.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.bot.get.path] });
      toast({
        title: data.isActive ? "Bot Activated" : "Bot Paused",
        description: data.isActive 
          ? "Trading bot is now running in the background." 
          : "Trading operations suspended.",
        variant: data.isActive ? "default" : "destructive",
      });
    },
  });
}

export function useAvailableCoins() {
  return useQuery<TradingPair[]>({
    queryKey: ['/api/coins/available'],
    queryFn: async () => {
      const res = await fetch('/api/coins/available', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch available coins');
      return res.json();
    },
  });
}

export function useEnabledCoins() {
  return useQuery<EnabledCoin[]>({
    queryKey: ['/api/coins/enabled'],
    queryFn: async () => {
      const res = await fetch('/api/coins/enabled', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) return [];
        throw new Error('Failed to fetch enabled coins');
      }
      return res.json();
    },
  });
}

export function useEnableCoin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ symbol, tradeAmount }: { symbol: string; tradeAmount?: string }) => {
      const res = await fetch('/api/coins/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, tradeAmount }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to enable coin');
      return res.json();
    },
    onSuccess: (_, { symbol }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/coins/enabled'] });
      queryClient.invalidateQueries({ queryKey: ['/api/coins/balances'] });
      toast({
        title: 'Coin Enabled',
        description: `${symbol} has been added to your trading portfolio.`,
      });
    },
  });
}

export function useDisableCoin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (symbol: string) => {
      const res = await fetch('/api/coins/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to disable coin');
      return res.json();
    },
    onSuccess: (_, symbol) => {
      queryClient.invalidateQueries({ queryKey: ['/api/coins/enabled'] });
      toast({
        title: 'Coin Disabled',
        description: `${symbol} has been removed from trading.`,
        variant: 'destructive',
      });
    },
  });
}

export function useCoinPrices() {
  return useQuery<Array<{ symbol: string; name: string; price: number; change24h: number }>>({
    queryKey: ['/api/coins/prices'],
    queryFn: async () => {
      const res = await fetch('/api/coins/prices', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) return [];
        throw new Error('Failed to fetch coin prices');
      }
      return res.json();
    },
    refetchInterval: 10000,
  });
}
