# Sitku (စိတ်ကူး)

**Sitku** is a powerful, local-first, offline-ready AI workspace and personal knowledge system built for macOS and modern browsers. Designed with user privacy and speed in mind, Sitku turns local Markdown files and Obsidian vaults into an intelligent agentic environment.

---

## ✨ Key Features

- **🔒 Local-First Architecture:** All configuration, caches, and memory databases live safely inside your local filesystem (`~/.sitku`). Zero mandatory cloud lock-in.
- **📁 Obsidian Vault Compatibility:** Seamlessly open existing Obsidian Markdown vaults or create new workspaces. Full support for per-vault appearance, custom themes, and font configurations (`appearance.json`, `workspace.json`, `core-plugins.json`).
- **⚡ Native Desktop & Web App:** Built on top of Electron, Vite, React, and TypeScript with ultra-lightweight production bundling tailored for macOS Apple Silicon (`arm64`) and Universal builds.
- **🤖 Autonomous AI Assistant:** Built-in agentic runtime with local memory indexing, skill execution, and automated workflow pipelines.

---

## 🚀 Quickstart

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- macOS (Apple Silicon M-series recommended)

### Installation & Run

```bash
# 1. Clone the repository
git clone git@github.com:sanlinhtik3/sitku.git
cd sitku

# 2. Install dependencies
npm install

# 3. Start Desktop App with Live Hot-Reload (Recommended for development)
npm run desktop:dev
```

---

## 🛠️ Build Commands

| Command | Description |
| :--- | :--- |
| `npm run desktop:dev` | Runs the Vite dev server + Electron with instant hot-reloading. |
| `npm run desktop` | Compiles the production bundle (`dist/`) and launches Electron. |
| `npm run dist:mac:arm64` | Packages a native macOS Apple Silicon (`.dmg` / `.app`) installer. |
| `npm run dist:mac:universal` | Packages a Universal macOS installer (Intel + M-series). |
| `npm run build` | Builds static PWA / Web release bundle. |

---

## 📂 System Storage Layout (`~/.sitku`)

When running locally, Sitku stores your workspace state securely in your home directory:

```text
~/.sitku/
 ├── app.json             # Global application settings & recent vaults
 ├── appearance.json      # Theme, fonts, accent colors, and UI preferences
 ├── workspace.json       # Layout, bookmarks, and vault configuration
 ├── core-plugins.json    # Enabled skills and agent core utilities
 ├── sitku-agent.sqlite   # Local SQLite agent memory & vector store
 ├── themes/              # Custom user-provided CSS themes
 └── vault/               # Default fallback local markdown vault
```

---

## 📄 Versioning & License

- **Version:** Calendar Versioning (`YYYY.M.D` e.g., `2026.7.3`)
- **Domain:** [sitku.space](https://sitku.space)
