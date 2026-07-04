import { useEffect } from "react";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatSpeed(bps: number): string {
  if (!bps || bps === 0) return "0 B/s";
  return `${formatBytes(bps)}/s`;
}

// Desktop (Electron) auto-update notice with real-time circular progress ring,
// transfer rates, error retry, and one-click restart.
export function DesktopUpdatePrompt() {
  useEffect(() => {
    const desktop = window.beebotDesktop;
    if (!desktop) return;

    const TOAST_ID = "desktop-update-monitor";

    const unsubs: Array<() => void> = [];

    if (desktop.onUpdateProgress) {
      unsubs.push(
        desktop.onUpdateProgress(({ percent, transferred, total, bytesPerSecond }) => {
          toast(
            <div className="flex items-center gap-3.5 w-full py-1">
              <div className="relative inline-flex items-center justify-center w-10 h-10 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    className="text-[var(--bb-border-strong)]"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="transparent"
                    r="14"
                    cx="18"
                    cy="18"
                  />
                  <circle
                    className="text-[var(--beebot-accent)] transition-all duration-300 ease-out"
                    strokeWidth="3.5"
                    strokeDasharray={87.96}
                    strokeDashoffset={87.96 - (87.96 * percent) / 100}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="14"
                    cx="18"
                    cy="18"
                  />
                </svg>
                <span className="absolute text-[10px] font-bold text-[var(--bb-text-1)]">{percent}%</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-[var(--bb-text-1)] flex items-center gap-2">
                  <span>Downloading Update</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--beebot-accent)] animate-pulse" />
                </div>
                <div className="text-xs text-[var(--bb-text-3)] truncate mt-0.5">
                  {formatBytes(transferred)} / {formatBytes(total)} · {formatSpeed(bytesPerSecond)}
                </div>
              </div>
            </div> as any,
            { id: TOAST_ID, duration: Infinity }
          );
        })
      );
    }

    if (desktop.onUpdateReady) {
      unsubs.push(
        desktop.onUpdateReady(({ version }) => {
          toast(`Update ready${version ? ` (v${version})` : ""}`, {
            id: TOAST_ID,
            description: "A new version has been downloaded and is ready to install.",
            duration: Infinity,
            action: {
              label: "🚀 Restart",
              onClick: () => desktop.installUpdate?.(),
            },
          });
        })
      );
    }

    if (desktop.onUpdateError) {
      unsubs.push(
        desktop.onUpdateError(({ message }) => {
          toast("Update failed", {
            id: TOAST_ID,
            description: message || "Failed to download update.",
            duration: 8000,
            action: {
              label: "Retry",
              onClick: () => desktop.startDownload?.(),
            },
          });
        })
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  return null;
}
