import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const usePushNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { count } = await supabase
        .from('push_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id);

      setIsSubscribed((count ?? 0) > 0);
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  const fetchVapidKey = async (): Promise<string | null> => {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/get-vapid-key`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const data = await res.json().catch(() => ({} as { publicKey?: string }));
      return data.publicKey || null;
    } catch (error) {
      console.error("Error fetching VAPID key:", error);
      return null;
    }
  };

  const requestPermission = async () => {
    if (!isSupported) {
      toast.error("Push notifications are not supported on this device");
      return false;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      toast.error("Please sign in to enable push notifications");
      return false;
    }

    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        await subscribeToPush(session.user.id);
        toast.success("Push notifications enabled!");
        return true;
      } else {
        toast.error("Push notification permission denied");
        return false;
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      toast.error("Failed to enable push notifications");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const subscribeToPush = async (userId: string) => {
    const vapidKey = await fetchVapidKey();
    if (!vapidKey) {
      throw new Error("Failed to fetch VAPID key");
    }

    const registration = await navigator.serviceWorker.ready as ServiceWorkerRegistration & { pushManager: PushManager };
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const subJson = sub.toJSON();

    // Save to database
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: subJson.keys!.p256dh!,
        auth: subJson.keys!.auth!,
        user_agent: navigator.userAgent,
      }, { onConflict: 'user_id,endpoint' });

    if (error) {
      console.error("Error saving subscription:", error);
      throw error;
    }

    setIsSubscribed(true);
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Unsubscribe from browser
      const registration = await navigator.serviceWorker.ready as ServiceWorkerRegistration & { pushManager: PushManager };
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }

      // Remove from database
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', session.user.id);

      setIsSubscribed(false);
      toast.success("Push notifications disabled");
    } catch (error) {
      console.error("Error unsubscribing:", error);
      toast.error("Failed to disable push notifications");
    } finally {
      setLoading(false);
    }
  };

  const sendTestNotification = async () => {
    if (permission === "granted") {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("BeeBot 🐝 Test", {
          body: "Push notifications are working! 🎉",
          icon: "/pwa-192x192.png",
          badge: "/favicon.ico",
          tag: "test-notification",
        });
        toast.success("Test notification sent!");
      } catch (error) {
        console.error("Error sending test notification:", error);
        toast.error("Failed to send test notification");
      }
    }
  };

  return {
    permission,
    isSupported,
    isSubscribed,
    loading,
    requestPermission,
    unsubscribe,
    sendTestNotification,
  };
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
