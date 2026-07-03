import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Tablet, Globe, MapPin, Clock, LogOut, CheckCircle2, XCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { motion } from "motion/react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface DeviceSessionCardProps {
  session: {
    id: string;
    device_type: string | null;
    device_name: string | null;
    os: string | null;
    browser: string | null;
    country: string | null;
    city: string | null;
    region: string | null;
    ip_address: string | null;
    created_at: string;
    last_activity: string;
    is_active: boolean;
    is_trusted: boolean;
  };
  onLogout: (sessionId: string) => void;
  isLoading?: boolean;
  isOnline?: boolean;
}

export function DeviceSessionCard({ session, onLogout, isLoading, isOnline = false }: DeviceSessionCardProps) {
  const getDeviceIcon = () => {
    const type = session.device_type?.toLowerCase();
    if (type === 'mobile') return Smartphone;
    if (type === 'tablet') return Tablet;
    return Monitor;
  };

  const DeviceIcon = getDeviceIcon();

  const location = [session.city, session.region, session.country]
    .filter(Boolean)
    .join(', ') || 'Unknown Location';

  const lastActiveDate = new Date(session.last_activity);
  const statusText = isOnline 
    ? "Online Now" 
    : `Last seen ${formatDistanceToNow(lastActiveDate, { addSuffix: true })}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="relative">
                <div className="p-3 rounded-lg bg-primary/10">
                  <DeviceIcon className="h-6 w-6 text-primary" />
                </div>
                {isOnline && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-background"></span>
                  </span>
                )}
              </div>
              
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-lg">
                    {session.device_name || 'Unknown Device'}
                  </h3>
                  {session.is_active ? (
                    <Badge className={isOnline ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" : "bg-muted"}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {statusText}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-muted-foreground">
                      <XCircle className="h-3 w-3 mr-1" />
                      Inactive
                    </Badge>
                  )}
                  {session.is_trusted && (
                    <Badge variant="outline" className="border-primary/50 text-primary">
                      Trusted
                    </Badge>
                  )}
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>{session.os || 'Unknown OS'} • {session.browser || 'Unknown Browser'}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{location}</span>
                  </div>
                  
                  {session.ip_address && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="font-mono text-xs">{session.ip_address}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>First login: {format(new Date(session.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Last activity: {format(new Date(session.last_activity), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                </div>
              </div>
            </div>

            {session.is_active && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isLoading}>
                    <LogOut className="h-4 w-4 mr-1" />
                    End Session
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End this session?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will immediately log out the user from this device. They will need to log in again to access their account.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onLogout(session.id)}>
                      End Session
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}