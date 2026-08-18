import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function unavailable(reason) {
  return {
    available: false,
    attached: false,
    reason,
    attach: () => false,
    detach: () => {},
    setAppearance: () => {},
    performHaptic: () => false,
    status() {
      return { available: this.available, attached: this.attached, reason: this.reason };
    },
  };
}

export function createMacNativeChromeBridge() {
  if (process.platform !== "darwin") return unavailable("macOS only");

  const candidates = [
    path.join(__dirname, "build", "sitku_native_chrome.node"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "electron", "native", "macos", "build", "sitku_native_chrome.node"),
  ];
  const addonPath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!addonPath) return unavailable("native module not built");

  try {
    const addon = require(addonPath);
    let handle = null;
    const bridge = {
      available: true,
      attached: false,
      reason: null,
      attach(window) {
        if (!window || window.isDestroyed()) return false;
        handle = window.getNativeWindowHandle();
        this.attached = Boolean(addon.attach(handle));
        this.reason = this.attached ? null : "native NSWindow is not ready";
        return this.attached;
      },
      detach() {
        if (handle) addon.detach(handle);
        handle = null;
        this.attached = false;
      },
      setAppearance(mode = "system") {
        if (!handle || !this.attached) return;
        addon.setAppearance(handle, mode === "dark" ? 1 : mode === "light" ? 2 : 0);
      },
      performHaptic(kind = "selection") {
        if (!this.attached) return false;
        addon.performHaptic(kind === "warning" ? 2 : 1);
        return true;
      },
      status() {
        return { available: this.available, attached: this.attached, reason: this.reason };
      },
    };
    return bridge;
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
