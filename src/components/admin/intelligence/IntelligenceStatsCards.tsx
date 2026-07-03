import { Card, CardContent } from "@/components/ui/card";
import { IconUsers, IconBolt, IconTrendingUp, IconChartBar } from "@tabler/icons-react";
import type { IntelligenceStats } from "./useUnifiedIntelligenceData";

interface Props {
  stats: IntelligenceStats | undefined;
}

export function IntelligenceStatsCards({ stats }: Props) {
  const cards = [
    {
      label: "Total Users",
      value: stats?.totalUsers ?? 0,
      icon: IconUsers,
      color: "text-primary",
      gradient: "from-primary/10 to-primary/5 border-primary/20",
    },
    {
      label: "IU Used Today",
      value: (stats?.iuUsedToday ?? 0).toFixed(1),
      icon: IconBolt,
      color: "text-blue-500",
      gradient: "from-blue-500/10 to-blue-500/5 border-blue-500/20",
    },
    {
      label: "Active Today",
      value: stats?.activeToday ?? 0,
      icon: IconTrendingUp,
      color: "text-green-500",
      gradient: "from-green-500/10 to-green-500/5 border-green-500/20",
    },
    {
      label: "Activity Rate",
      value: `${(stats?.usageRate ?? 0).toFixed(1)}%`,
      icon: IconChartBar,
      color: "text-amber-500",
      gradient: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={`bg-gradient-to-br ${c.gradient}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              </div>
              <c.icon className={`h-8 w-8 ${c.color} opacity-50`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
