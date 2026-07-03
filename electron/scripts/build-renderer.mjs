import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_REPOSITORY_RUNTIME: "local",
    VITE_DESKTOP_BUILD: "true",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
