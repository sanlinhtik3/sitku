import { useEffect } from "react";
import { toast } from "sonner";

// Desktop (Electron) auto-update notice. When electron-updater finishes
// downloading a new version, the main process notifies us via
// window.beebotDesktop.onUpdateReady — we surface a persistent toast with a
// "Restart" action that installs it. Web/PWA updates use PWAUpdatePrompt.
export function DesktopUpdatePrompt() {
  useEffect(() => {
    const desktop = window.beebotDesktop;
    if (!desktop?.onUpdateReady) return;
    return desktop.onUpdateReady(({ version }) => {
      toast(`Update ready${version ? ` (v${version})` : ""}`, {
        description: "A new version has been downloaded.",
        duration: Infinity,
        action: {
          label: "Restart",
          onClick: () => desktop.installUpdate?.(),
        },
      });
    });
  }, []);

  return null;
}
