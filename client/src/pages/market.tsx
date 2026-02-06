import { useMarketPrices } from "@/hooks/use-market";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function MarketPage() {
  const { data: prices, isLoading } = useMarketPrices();

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Live Market</h1>
          <p className="text-muted-foreground mt-1">
            Real-time cryptocurrency prices and 24h changes.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 max-w-2xl">
            {prices?.map((asset) => {
              const isPositive = asset.change24h >= 0;
              const assetInfo = {
                KAS: { name: 'Kaspa', color: 'text-teal-500', bgColor: 'bg-teal-500/20', icon: Activity },
              }[asset.symbol] || { name: asset.symbol, color: 'text-gray-500', bgColor: 'bg-gray-500/20', icon: Activity };

              const Icon = assetInfo.icon;

              return (
                <Card 
                  key={asset.symbol} 
                  className="glass-card p-8 border-white/5 relative overflow-hidden group hover:border-primary/50 transition-all duration-300"
                >
                  <div className={`absolute top-0 right-0 p-8 opacity-5 transition-transform duration-500 group-hover:scale-110 ${assetInfo.color}`}>
                    <Icon className="w-32 h-32" />
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${assetInfo.bgColor} ${assetInfo.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold">{assetInfo.name}</h3>
                        <span className="text-sm text-muted-foreground">{asset.symbol} / USD</span>
                      </div>
                    </div>

                    <div className="mt-8">
                      <div className="text-4xl font-bold font-display tracking-tighter">
                        ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className={`flex items-center gap-2 mt-2 font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositive ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                        {Math.abs(asset.change24h).toFixed(2)}% (24h)
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
