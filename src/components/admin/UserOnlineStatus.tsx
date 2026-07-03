import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { Monitor } from "lucide-react";

interface UserOnlineStatusProps {
  isOnline: boolean;
  deviceInfo?: {
    device_name: string | null;
    os: string | null;
    browser: string | null;
    city: string | null;
    country: string | null;
  } | null;
}

export const UserOnlineStatus = ({ isOnline, deviceInfo }: UserOnlineStatusProps) => {
  if (!isOnline) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground/30"></span>
        </span>
        Offline
      </Badge>
    );
  }

  const getDeviceDisplay = () => {
    if (!deviceInfo) return null;
    
    const parts: string[] = [];
    
    if (deviceInfo.device_name) {
      parts.push(deviceInfo.device_name);
    } else if (deviceInfo.browser && deviceInfo.os) {
      parts.push(`${deviceInfo.browser} on ${deviceInfo.os}`);
    }
    
    if (deviceInfo.city && deviceInfo.country) {
      parts.push(`${deviceInfo.city}, ${deviceInfo.country}`);
    } else if (deviceInfo.country) {
      parts.push(deviceInfo.country);
    }
    
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  const deviceDisplay = getDeviceDisplay();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="online"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-2 flex-wrap"
      >
        <Badge 
          variant="outline" 
          className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 flex items-center gap-1.5"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Online
        </Badge>
        
        {deviceDisplay && (
          <Badge variant="secondary" className="text-xs flex items-center gap-1.5">
            <Monitor className="h-3 w-3" />
            {deviceDisplay}
          </Badge>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
