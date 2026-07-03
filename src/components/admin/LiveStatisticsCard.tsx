import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Activity } from "lucide-react";
import { motion } from "motion/react";
import { useGlobalPresence } from "@/hooks/useGlobalPresence";
import { AnimatedCounter } from "@/components/ui/animated-counter";

export const LiveStatisticsCard = () => {
  const { totalOnlineCount } = useGlobalPresence();

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-background to-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Live Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Online Users</p>
            <div className="flex items-baseline gap-2">
              <AnimatedCounter 
                end={totalOnlineCount} 
                className="text-3xl font-bold text-primary"
              />
              <motion.div
                className="h-2 w-2 rounded-full bg-green-500"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.8, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </div>
          </div>
          <div className="relative">
            <motion.div
              className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <div className="relative p-4 bg-primary/10 rounded-full">
              <Users className="h-8 w-8 text-primary" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
