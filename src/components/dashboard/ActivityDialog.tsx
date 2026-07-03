import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Bell, TrendingUp, Clock } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ActivityDialog = ({ open, onOpenChange }: ActivityDialogProps) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "enrollment":
        return "📚";
      case "achievement":
        return "🏆";
      case "certificate":
        return "🎓";
      case "credit":
        return "💰";
      case "referral":
        return "👥";
      default:
        return "🔔";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Recent Activity
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="notifications" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:gap-2 h-auto">
            <TabsTrigger value="notifications" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2">
              <Bell className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-1 sm:ml-2 text-[10px] sm:text-xs px-1 sm:px-1.5">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-2">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Activity </span>Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="flex-1 overflow-y-auto mt-3 sm:mt-4 md:mt-6">
            <div className="space-y-3 sm:space-y-4">
              {unreadCount > 0 && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={markAllAsRead} className="text-xs sm:text-sm h-8 sm:h-9">
                    Mark all as read
                  </Button>
                </div>
              )}

              {notifications.length === 0 ? (
                <Card>
                  <CardContent className="p-8 sm:p-12 text-center">
                    <Bell className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3 sm:mb-4" />
                    <p className="text-sm sm:text-base text-muted-foreground">No notifications yet</p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                      You'll see updates here as you engage with the platform
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {notifications.map((notification) => (
                    <Card
                      key={notification.id}
                      className={notification.is_read ? "opacity-60" : "border-primary/30"}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start gap-2 sm:gap-3">
                          <div className="text-xl sm:text-2xl">{getNotificationIcon(notification.type)}</div>
                          <div className="flex-1 space-y-0.5 sm:space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm sm:text-base font-medium">{notification.title}</h4>
                              {!notification.is_read && (
                                <Badge variant="default" className="text-[10px] sm:text-xs px-1 sm:px-1.5">
                                  New
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {notification.message}
                            </p>
                            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
                              <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              {format(new Date(notification.created_at), "MMM d, yyyy 'at' h:mm a")}
                            </div>
                          </div>
                          {!notification.is_read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsRead(notification.id)}
                              className="text-xs h-8"
                            >
                              Mark as read
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="stats" className="flex-1 overflow-y-auto mt-3 sm:mt-4 md:mt-6">
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <Card>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        <p className="text-xs sm:text-sm text-muted-foreground">Total Notifications</p>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold">{notifications.length}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
                        <p className="text-xs sm:text-sm text-muted-foreground">Unread</p>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold">{unreadCount}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <div className="space-y-1 sm:space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                        <p className="text-xs sm:text-sm text-muted-foreground">This Week</p>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold">
                        {notifications.filter(n => {
                          const weekAgo = new Date();
                          weekAgo.setDate(weekAgo.getDate() - 7);
                          return new Date(n.created_at) > weekAgo;
                        }).length}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold">Activity Insights</h3>
                  <div className="space-y-2 sm:space-y-3">
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      💡 Stay active to unlock more achievements and rewards!
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      🎯 Keep checking notifications to stay updated on your progress
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
