import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import pkg from "../../../package.json";

// GitHub repo that hosts the releases (matches package.json build.publish).
const REPO = "sanlinhtik3/sitku";
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; latest: string }
  | { kind: "outdated"; latest: string; url: string }
  | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Numeric semver-ish compare of "1.2.3" strings (leading "v" stripped).
// Returns 1 if a > b, -1 if a < b, 0 if equal.
function cmpVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function VersionCheck() {
  const [current, setCurrent] = useState<string>(pkg.version);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; transferred: number; total: number; bytesPerSecond: number } | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  // In the packaged desktop app, app.getVersion() is authoritative (the tag the
  // build was cut from); the bundled package.json is only the web fallback.
  useEffect(() => {
    const desktop = window.beebotDesktop;
    if (desktop) {
      desktop.getVersion?.().then((v) => { if (v) setCurrent(v); }).catch(() => {});

      const unsubs: Array<() => void> = [];
      if (desktop.onUpdateProgress) {
        unsubs.push(desktop.onUpdateProgress((info) => {
          setDownloadProgress(info);
          setStatus((prev) => prev.kind !== "outdated" ? { kind: "outdated", latest: "New Version", url: RELEASES_URL } : prev);
        }));
      }
      if (desktop.onUpdateReady) {
        unsubs.push(desktop.onUpdateReady(() => {
          setIsReady(true);
          setDownloadProgress(null);
        }));
      }
      if (desktop.onUpdateStatus) {
        unsubs.push(desktop.onUpdateStatus(({ status: s, version }) => {
          if (s === "available" && version) {
            setStatus({ kind: "outdated", latest: version, url: RELEASES_URL });
          }
        }));
      }
      if (desktop.onUpdateError) {
        unsubs.push(desktop.onUpdateError(({ message }) => {
          setStatus({ kind: "error", message: message || "Download failed" });
          setDownloadProgress(null);
        }));
      }
      return () => unsubs.forEach((fn) => fn());
    }
  }, []);

  async function check() {
    setStatus({ kind: "checking" });
    const desktop = window.beebotDesktop;
    if (desktop?.checkForUpdates) {
      desktop.checkForUpdates().catch(() => {});
    }
    try {
      const res = await fetch(LATEST_API, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(res.status === 404 ? "No releases published yet" : `GitHub responded ${res.status}`);
      const data = await res.json();
      const latest = String(data.tag_name || "").replace(/^v/i, "");
      if (!latest) throw new Error("No version tag on the latest release");
      if (cmpVersions(latest, current) > 0) {
        setStatus({ kind: "outdated", latest, url: data.html_url || RELEASES_URL });
      } else {
        setStatus({ kind: "current", latest });
      }
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Check failed" });
    }
  }

  function handleDownloadClick(url: string) {
    const desktop = window.beebotDesktop;
    if (desktop?.startDownload) {
      desktop.startDownload().catch(() => window.open(url, "_blank", "noopener,noreferrer"));
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <div className="font-medium text-[var(--bb-text-1)]">Version</div>
        <div className="text-sm text-[var(--bb-text-3)]">
          Sitku {current}
          {status.kind === "current" && !isReady && !downloadProgress && " · up to date"}
          {status.kind === "outdated" && !isReady && !downloadProgress && (
            <> · <span className="text-[var(--beebot-accent)]">{status.latest} available</span></>
          )}
          {downloadProgress && (
            <> · <span className="text-[var(--beebot-accent)]">Downloading ({formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)})</span></>
          )}
          {isReady && <> · <span className="text-emerald-400 font-medium">Ready to install</span></>}
          {status.kind === "error" && <> · <span className="text-red-400">{status.message}</span></>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {downloadProgress && (
          <div className="relative inline-flex items-center justify-center w-8 h-8 shrink-0">
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
                strokeDashoffset={87.96 - (87.96 * downloadProgress.percent) / 100}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="14"
                cx="18"
                cy="18"
              />
            </svg>
            <span className="absolute text-[9px] font-bold text-[var(--bb-text-1)]">{downloadProgress.percent}%</span>
          </div>
        )}

        {isReady ? (
          <Button
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm animate-pulse"
            onClick={() => window.beebotDesktop?.installUpdate?.()}
          >
            🚀 Restart to Update
          </Button>
        ) : downloadProgress ? (
          <Button
            variant="secondary"
            disabled
            className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] opacity-80 cursor-not-allowed"
          >
            Downloading…
          </Button>
        ) : status.kind === "outdated" ? (
          <Button
            variant="secondary"
            className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]"
            onClick={() => handleDownloadClick(status.url)}
          >
            Download {status.latest}
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]"
            disabled={status.kind === "checking"}
            onClick={check}
          >
            {status.kind === "checking" ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </div>
    </div>
  );
}
