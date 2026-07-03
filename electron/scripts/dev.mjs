import { spawn } from "node:child_process";
import electronPath from "electron";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const rendererUrl = "http://127.0.0.1:8080";

function spawnProcess(command, args, extraEnv = {}) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

async function waitForRenderer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${rendererUrl}`);
}

const vite = spawnProcess(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "8080", "--strictPort"], {
  VITE_REPOSITORY_RUNTIME: "local",
});

try {
  await waitForRenderer();
  const electron = spawnProcess(electronPath, ["electron/main.mjs"], {
    SITKU_RENDERER_URL: rendererUrl,
    PUTUTU_RENDERER_URL: rendererUrl,
  });

  electron.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error);
  vite.kill();
  process.exit(1);
}
