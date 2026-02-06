import { Card } from "@/components/ui/card";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  icon: ReactNode;
  className?: string;
}

export function StatCard({ title, value, subValue, trend, trendValue, icon, className }: StatCardProps) {
  return (
    <Card className={cn(
      "glass-card p-6 rounded-2xl relative overflow-hidden group hover:border-primary/50 transition-colors duration-300", 
      className
    )}>
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
        {icon}
      </div>
      
      <div className="relative z-10">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold font-display mt-2 tracking-tight">{value}</h3>
        
        <div className="flex items-center gap-2 mt-2">
          {trendValue && (
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              trend === "up" ? "bg-green-500/10 text-green-500" :
              trend === "down" ? "bg-red-500/10 text-red-500" :
              "bg-gray-500/10 text-gray-400"
            )}>
              {trend === "up" ? "+" : ""}{trendValue}
            </span>
          )}
          {subValue && (
            <span className="text-sm text-muted-foreground">{subValue}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
