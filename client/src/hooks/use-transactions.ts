import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useTransactions() {
  return useQuery({
    queryKey: [api.transactions.list.path],
    queryFn: async () => {
      const res = await fetch(api.transactions.list.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null;
        throw new Error("Failed to fetch transactions");
      }
      return api.transactions.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
  });
}
