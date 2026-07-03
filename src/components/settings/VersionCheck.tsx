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

  // In the packaged desktop app, app.getVersion() is authoritative (the tag the
  // build was cut from); the bundled package.json is only the web fallback.
  useEffect(() => {
    window.beebotDesktop?.getVersion?.().then((v) => { if (v) setCurrent(v); }).catch(() => {});
  }, []);

  async function check() {
    setStatus({ kind: "checking" });
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

  return (
    <div className="flex items-center justify-between gap-5">
      <div>
        <div className="font-medium text-[var(--bb-text-1)]">Version</div>
        <div className="text-sm text-[var(--bb-text-3)]">
          Sitku {current}
          {status.kind === "current" && " · up to date"}
          {status.kind === "outdated" && (
            <> · <span className="text-[var(--beebot-accent)]">{status.latest} available</span></>
          )}
          {status.kind === "error" && <> · <span className="text-red-400">{status.message}</span></>}
        </div>
      </div>
      {status.kind === "outdated" ? (
        <Button
          variant="secondary"
          className="bg-[var(--bb-bg-4)] text-[var(--bb-text-1)] hover:bg-[var(--bb-border-strong)]"
          onClick={() => window.open(status.url, "_blank", "noopener,noreferrer")}
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
  );
}
