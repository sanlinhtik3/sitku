import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award, Star } from "lucide-react";

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Trophy className="h-6 w-6 text-yellow-500" />;
    case 2:
      return <Medal className="h-6 w-6 text-gray-400" />;
    case 3:
      return <Award className="h-6 w-6 text-amber-600" />;
    default:
      return <Star className="h-5 w-5 text-muted-foreground" />;
  }
};

const getRankBadge = (referralCount: number) => {
  if (referralCount >= 50) return { label: "Legend", variant: "default" as const };
  if (referralCount >= 25) return { label: "Master", variant: "default" as const };
  if (referralCount >= 10) return { label: "Expert", variant: "secondary" as const };
  if (referralCount >= 5) return { label: "Pro", variant: "secondary" as const };
  return { label: "Starter", variant: "outline" as const };
};

export const ReferralLeaderboard = () => {
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["referral-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_codes")
        .select(`
          *,
          profiles:user_id(full_name, avatar_url)
        `)
        .order("total_referrals", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-96 animate-pulse bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <CardTitle>Referral Leaderboard</CardTitle>
        </div>
        <CardDescription>Top referrers and their achievements</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {leaderboard?.map((entry: any, index: number) => {
            const rank = index + 1;
            const badge = getRankBadge(entry.total_referrals);
            
            return (
              <div
                key={entry.id}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex-shrink-0 w-8 flex items-center justify-center">
                  {getRankIcon(rank)}
                </div>
                
                <div className="flex items-center gap-3 flex-1">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={entry.profiles?.avatar_url} />
                    <AvatarFallback>
                      {entry.profiles?.full_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {entry.profiles?.full_name || "Anonymous User"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={badge.variant} className="text-xs">
                        {badge.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Rank #{rank}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">
                    {entry.total_referrals}
                  </p>
                  <p className="text-xs text-muted-foreground">referrals</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {entry.total_credits_earned} credits earned
                  </p>
                </div>
              </div>
            );
          })}

          {(!leaderboard || leaderboard.length === 0) && (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No referrals yet. Be the first to invite friends!
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
