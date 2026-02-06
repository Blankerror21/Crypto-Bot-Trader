import { useTransactions } from "@/hooks/use-transactions";
import { useBotSettings, useUpdateBotSettings } from "@/hooks/use-bot";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowUpRight, ArrowDownRight, Search, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export default function TransactionsPage() {
  const { data: transactions, isLoading } = useTransactions();
  const { data: botSettings } = useBotSettings();
  const updateSettings = useUpdateBotSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState("");

  const isSimulation = botSettings?.isSimulation ?? true;

  const handleSimulationToggle = async (checked: boolean) => {
    const newIsSimulation = !checked;
    await updateSettings.mutateAsync({ isSimulation: newIsSimulation });
    queryClient.invalidateQueries({ queryKey: [api.portfolio.get.path] });
    toast({
      title: newIsSimulation ? "Simulation Mode" : "Real Trading Mode",
      description: newIsSimulation 
        ? "Trading with virtual funds." 
        : "Connected to your Kraken account. Real funds will be used.",
      variant: newIsSimulation ? "default" : "destructive",
    });
  };

  const filteredTransactions = transactions?.filter(tx => 
    tx.symbol.toLowerCase().includes(filter.toLowerCase()) || 
    tx.type.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight">Transactions</h1>
            <p className="text-muted-foreground mt-1">
              History of all automated trading activities.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-card/50">
              <Label htmlFor="trading-mode-tx" className="text-sm font-medium cursor-pointer">
                {isSimulation ? "Simulation" : "Real Trading"}
              </Label>
              <Switch
                id="trading-mode-tx"
                data-testid="switch-trading-mode-tx"
                checked={!isSimulation}
                onCheckedChange={handleSimulationToggle}
                disabled={updateSettings.isPending}
              />
              {!isSimulation && (
                <AlertTriangle className="w-4 h-4 text-orange-500" />
              )}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search symbol or type..." 
                className="pl-9 bg-card/50"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                data-testid="input-search-transactions"
              />
            </div>
          </div>
        </div>

        <Card className="glass-card border-white/5 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              No transactions found. Start the bot to generate activity.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-white/5">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Symbol</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTransactions?.map((tx) => {
                    const isBuy = tx.type === 'buy';
                    return (
                      <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isBuy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                          }`}>
                            {isBuy ? <ArrowDownRight className="w-3 h-3 mr-1" /> : <ArrowUpRight className="w-3 h-3 mr-1" />}
                            {tx.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium">
                          {tx.symbol}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm">
                          {Number(tx.amount).toFixed(6)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm text-muted-foreground">
                          ${Number(tx.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-sm font-medium">
                          ${(Number(tx.amount) * Number(tx.price)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-muted-foreground">
                          {tx.timestamp && format(new Date(tx.timestamp), "MMM dd, HH:mm")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
