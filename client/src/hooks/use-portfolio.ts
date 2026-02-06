import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function usePortfolio() {
  return useQuery({
    queryKey: [api.portfolio.get.path],
    queryFn: async () => {
      const res = await fetch(api.portfolio.get.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null;
        throw new Error("Failed to fetch portfolio");
      }
      return api.portfolio.get.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll every 5s for live updates
  });
}

export function useResetPortfolio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.portfolio.reset.path, {
        method: api.portfolio.reset.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reset portfolio");
      return api.portfolio.reset.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.portfolio.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.transactions.list.path] });
      toast({
        title: "Simulation Reset",
        description: "Your portfolio has been reset to $10,000 USD.",
      });
    },
  });
}
