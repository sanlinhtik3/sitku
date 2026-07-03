/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';

const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function PWAUpdatePrompt() {
  const toastShownRef = useRef(false);
  // Capture the update-interval handle so it can be cleared — otherwise every
  // re-register (dev HMR, SW swap) stacks another interval that runs forever,
  // a slow but real idle CPU leak. Cleared on re-register + on unmount.
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
      if (registration) {
        updateIntervalRef.current = setInterval(() => {
          void registration.update();
        }, SW_UPDATE_INTERVAL_MS);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  useEffect(() => {
    if (needRefresh && !toastShownRef.current) {
      toastShownRef.current = true;
      toast('🔄 Update Available', {
        description: 'A new version is ready. Tap to refresh.',
        duration: Infinity,
        action: {
          label: 'Update',
          onClick: () => updateServiceWorker(true),
        },
      });
    }
  }, [needRefresh, updateServiceWorker]);

  // Clear the interval on unmount so it doesn't outlive the component.
  useEffect(() => {
    return () => {
      if (updateIntervalRef.current) clearInterval(updateIntervalRef.current);
    };
  }, []);

  return null;
}
