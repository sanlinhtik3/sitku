import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Download, Bell, CheckCircle, Smartphone, Wifi, Zap } from "lucide-react";
import { toast } from "sonner";

export default function Install() {
  const navigate = useNavigate();
  const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
  const { permission, isSupported, isSubscribed, requestPermission, sendTestNotification } = usePushNotifications();

  useEffect(() => {
    if (isInstalled) {
      toast.success("App is already installed!");
    }
  }, [isInstalled]);

  const handleInstall = async () => {
    const success = await promptInstall();
    if (success) {
      toast.success("App installed successfully!");
      setTimeout(() => navigate("/"), 2000);
    }
  };

  const handleEnableNotifications = async () => {
    const success = await requestPermission();
    if (success) {
      setTimeout(() => sendTestNotification(), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <Navbar />
      
      <main className="pt-16 sm:pt-20 md:pt-24 pb-12 sm:pb-16">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 max-w-4xl">
          {/* Hero Section */}
          <div className="text-center mb-8 sm:mb-12">
            <img 
              src="/zoecrypto-icon.jpg" 
              alt="ZOE CRYPTO" 
              className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-lg shadow-primary/20"
            />
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Install <span className="text-primary">ZOE CRYPTO</span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base md:text-lg max-w-2xl mx-auto">
              Get the full app experience on your device. Works offline and feels like a native app!
            </p>
          </div>

          {/* Install Status */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                App Installation
              </CardTitle>
              <CardDescription>
                Install ZOE CRYPTO as an app on your device for quick access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isInstalled ? (
                <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium text-green-600 dark:text-green-400">App Installed</p>
                    <p className="text-sm text-muted-foreground">
                      You're using the installed version of ZOE CRYPTO
                    </p>
                  </div>
                </div>
              ) : isInstallable ? (
                <div>
                  <Button onClick={handleInstall} className="w-full gap-2" size="lg">
                    <Download className="h-5 w-5" />
                    Install App Now
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    One-click installation. No app store required!
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    To install on iOS: Tap the Share button <span className="inline-block px-1">↑</span> and select "Add to Home Screen"
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    To install on Android: Open the browser menu (⋮) and select "Install app" or "Add to Home screen"
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Push Notifications */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Push Notifications
              </CardTitle>
              <CardDescription>
                Get notified about new courses, updates, and achievements
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isSupported ? (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Push notifications are not supported on this device/browser
                  </p>
                </div>
              ) : permission === "granted" && isSubscribed ? (
                <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="font-medium text-green-600 dark:text-green-400">Notifications Enabled</p>
                    <p className="text-sm text-muted-foreground">
                      You'll receive important updates and notifications
                    </p>
                  </div>
                </div>
              ) : permission === "denied" ? (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Notification permission was denied. Please enable it in your browser settings.
                  </p>
                </div>
              ) : (
                <Button onClick={handleEnableNotifications} variant="outline" className="w-full gap-2">
                  <Bell className="h-5 w-5" />
                  Enable Notifications
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="text-center p-4">
              <Smartphone className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold mb-1 text-sm">Native Experience</h3>
              <p className="text-xs text-muted-foreground">
                Looks and feels like a native app
              </p>
            </Card>

            <Card className="text-center p-4">
              <Wifi className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold mb-1 text-sm">Works Offline</h3>
              <p className="text-xs text-muted-foreground">
                Access your courses without internet
              </p>
            </Card>

            <Card className="text-center p-4">
              <Zap className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h3 className="font-semibold mb-1 text-sm">Lightning Fast</h3>
              <p className="text-xs text-muted-foreground">
                Instant loading with smart caching
              </p>
            </Card>
          </div>

          {/* Back Button */}
          <div className="text-center">
            <Button onClick={() => navigate("/")} variant="ghost">
              Back to Home
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
