import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Monitor, Smartphone, Tablet, Laptop, LogOut, MapPin, Globe, Clock } from "lucide-react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";

interface Session {
  id: string;
  device_type: string | null;
  device_name: string | null;
  os: string | null;
  browser: string | null;
  city: string | null;
  country: string | null;
  ip_address: string | null;
  last_activity: string;
  created_at: string;
  is_active: boolean;
  is_trusted: boolean | null;
}

interface ActiveSessionCardProps {
  session: Session;
  isCurrentDevice: boolean;
  isOnline: boolean;
  onEndSession: (sessionId: string) => void;
  isLoading: boolean;
}

export const ActiveSessionCard = ({
  session,
  isCurrentDevice,
  isOnline,
  onEndSession,
  isLoading,
}: ActiveSessionCardProps) => {
  const getDeviceIcon = () => {
    const type = session.device_type?.toLowerCase();
    if (type === "mobile") return Smartphone;
    if (type === "tablet") return Tablet;
    if (type === "desktop") return Monitor;
    return Laptop;
  };

  const DeviceIcon = getDeviceIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`p-4 transition-all duration-300 ${
        isCurrentDevice 
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/20' 
          : 'border-border/50 hover:border-border hover:shadow-md'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {/* Device Icon */}
            <div className={`p-3 rounded-xl ${
              isCurrentDevice 
                ? 'bg-primary/20' 
                : 'bg-secondary/50'
            }`}>
              <DeviceIcon className={`h-5 w-5 ${
                isCurrentDevice ? 'text-primary' : 'text-muted-foreground'
              }`} />
            </div>

            {/* Session Details */}
            <div className="flex-1 space-y-2">
              {/* Device Name & Status */}
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-foreground">
                  {session.device_name || `${session.browser || 'Unknown'} Browser`}
                </h4>
                
                {/* Current Device Badge */}
                {isCurrentDevice && (
                  <Badge variant="default" className="text-xs">
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-current mr-1.5"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.7, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    Current Device
                  </Badge>
                )}

                {/* Online Status Badge */}
                {isOnline && (
                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5"
                      animate={{
                        scale: [1, 1.3, 1],
                        opacity: [1, 0.6, 1],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                    Online Now
                  </Badge>
                )}

                {/* Trusted Device Badge */}
                {session.is_trusted && (
                  <Badge variant="outline" className="text-xs">
                    Trusted
                  </Badge>
                )}
              </div>

              {/* OS & Browser Info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {session.os && (
                  <span className="flex items-center gap-1">
                    <Monitor className="h-3 w-3" />
                    {session.os}
                  </span>
                )}
                {session.browser && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {session.browser}
                  </span>
                )}
              </div>

              {/* Location & IP */}
              {(session.city || session.country || session.ip_address) && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {(session.city || session.country) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[session.city, session.country].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {session.ip_address && (
                    <span className="text-xs font-mono">
                      {session.ip_address}
                    </span>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {isOnline ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">Active now</span>
                  ) : (
                    <span>Last seen {formatDistanceToNow(new Date(session.last_activity), { addSuffix: true })}</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* End Session Button */}
          {!isCurrentDevice && session.is_active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={isLoading}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>End this session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will immediately log out the device and end its active session. 
                    The user will need to sign in again on that device.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onEndSession(session.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    End Session
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </Card>
    </motion.div>
  );
};
