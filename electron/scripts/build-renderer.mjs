import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

if (process.platform === "darwin") {
  const nativeBuild = spawnSync(process.execPath, ["electron/scripts/build-native-macos.mjs"], {
    stdio: "inherit",
  });
  if (nativeBuild.status !== 0) process.exit(nativeBuild.status ?? 1);
}

const rendererBuild = spawnSync(npmCommand, ["run", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    VITE_REPOSITORY_RUNTIME: "local",
    VITE_DESKTOP_BUILD: "true",
  },
});
process.exit(rendererBuild.status ?? 1);
