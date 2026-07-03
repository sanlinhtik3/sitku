import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/dateUtils";

interface StreakCalendarProps {
  userId: string;
}

interface DayActivity {
  date: string;
  count: number;
}

export const StreakCalendar = ({ userId }: StreakCalendarProps) => {
  const [activities, setActivities] = useState<DayActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [userId]);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from("learning_streaks")
        .select("streak_date, activity_count")
        .eq("user_id", userId)
        .order("streak_date", { ascending: false })
        .limit(90);

      if (!error && data) {
        setActivities(data.map(d => ({
          date: d.streak_date,
          count: d.activity_count
        })));
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityLevel = (count: number) => {
    if (count === 0) return "bg-muted";
    if (count === 1) return "bg-primary/30";
    if (count === 2) return "bg-primary/60";
    return "bg-primary";
  };

  const getLast90Days = () => {
    const days = [];
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      days.push(formatLocalDate(date));
    }
    return days;
  };

  const activityMap = activities.reduce((acc, activity) => {
    acc[activity.date] = activity.count;
    return acc;
  }, {} as Record<string, number>);

  const last90Days = getLast90Days();
  const weeks = [];
  for (let i = 0; i < last90Days.length; i += 7) {
    weeks.push(last90Days.slice(i, i + 7));
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            Learning Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(13)].map((_, i) => (
              <div key={i} className="flex gap-1">
                {[...Array(7)].map((_, j) => (
                  <div key={j} className="h-3 w-3 bg-muted rounded-sm" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-primary" />
          Learning Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 overflow-x-auto">
          <div className="inline-flex flex-col gap-1 min-w-max">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="flex gap-1">
                {week.map((day) => {
                  const count = activityMap[day] || 0;
                  return (
                    <div
                      key={day}
                      className={cn(
                        "h-3 w-3 rounded-sm transition-colors",
                        getActivityLevel(count)
                      )}
                      title={`${day}: ${count} activities`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground pt-3">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="h-3 w-3 rounded-sm bg-muted" />
              <div className="h-3 w-3 rounded-sm bg-primary/30" />
              <div className="h-3 w-3 rounded-sm bg-primary/60" />
              <div className="h-3 w-3 rounded-sm bg-primary" />
            </div>
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
