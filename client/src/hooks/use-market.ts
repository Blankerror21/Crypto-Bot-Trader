import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useMarketPrices() {
  return useQuery({
    queryKey: [api.market.prices.path],
    queryFn: async () => {
      const res = await fetch(api.market.prices.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch market prices");
      return api.market.prices.responses[200].parse(await res.json());
    },
    refetchInterval: 3000, // Frequent polling for live feel
  });
}
