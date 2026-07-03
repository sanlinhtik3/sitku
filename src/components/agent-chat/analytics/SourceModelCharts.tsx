import { Key, Cloud } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

interface SourceModelChartsProps {
  apiSourceBreakdown: { name: string; value: number; fill: string }[];
  modelBreakdown: { model: string; count: number; fill: string }[];
}

export function SourceModelCharts({ apiSourceBreakdown, modelBreakdown }: SourceModelChartsProps) {
  const safeApiSource = apiSourceBreakdown || [];
  const safeModelBreakdown = modelBreakdown || [];
  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* API Source Pie Chart */}
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Key className="h-4 w-4 text-green-400" />
            API Source Distribution
          </h3>
          {safeApiSource.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={safeApiSource} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                  {safeApiSource.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
          )}
        </CardContent>
      </Card>

      {/* Model Usage Bar Chart */}
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-400" />
            Model Usage
          </h3>
          {safeModelBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={safeModelBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="model" type="category" width={80} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {safeModelBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
