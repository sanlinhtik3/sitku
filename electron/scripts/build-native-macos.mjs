import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..", "..");
const sourceDir = path.join(projectRoot, "electron", "native", "macos");
const buildDir = path.join(sourceDir, "build");

if (process.platform !== "darwin") {
  console.log("[native-macos] skipped: macOS only");
  process.exit(0);
}

const headerCandidates = [
  "/usr/local/include/node",
  "/opt/homebrew/include/node",
  path.resolve(path.dirname(process.execPath), "..", "include", "node"),
];
const nodeHeaders = headerCandidates.find((candidate) => fs.existsSync(path.join(candidate, "node_api.h")));
if (!nodeHeaders) {
  console.warn("[native-macos] Node N-API headers unavailable; Electron fallback will be used");
  process.exit(0);
}

fs.mkdirSync(buildDir, { recursive: true });
const addonObject = path.join(buildDir, "addon.o");
const output = path.join(buildDir, "sitku_native_chrome.node");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("xcrun", [
  "clang++",
  "-std=c++17",
  "-fobjc-arc",
  `-I${nodeHeaders}`,
  "-c",
  path.join(sourceDir, "addon.mm"),
  "-o",
  addonObject,
]);

run("xcrun", [
  "swiftc",
  "-swift-version",
  "5",
  path.join(sourceDir, "SitkuNativeChrome.swift"),
  addonObject,
  "-emit-library",
  "-o",
  output,
  "-Xlinker",
  "-undefined",
  "-Xlinker",
  "dynamic_lookup",
  "-Xlinker",
  "-lc++",
]);

fs.rmSync(addonObject, { force: true });
console.log(`[native-macos] built ${path.relative(projectRoot, output)}`);
