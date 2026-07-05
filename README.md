# Sitku (စိတ်ကူး)

[![Version](https://img.shields.io/badge/version-2026.7.5-blue.svg)](https://sitku.space)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Web-purple.svg)](https://sitku.space)
[![Architecture](https://img.shields.io/badge/architecture-Local--First%20%7C%20Offline--Ready-green.svg)](https://sitku.space)

---

## 🌟 စိတ်ကူး (Sitku) ဆိုတာ ဘာလဲ?

စိတ်ကူး app က note taking app ပါ။ သူ့ကို အဓိက Productivity နဲ့ Data တွေကို Visualization နဲ့ ကြည့်ချင်သူတွေအတွက် အသုံးဝင်ပါတယ်။ 

ဘာလုပ်လို့ရလဲဆိုတော့ နေ့စဉ် ကိုယ့်ရဲ့စိတ်ကူးတွေကို ကွန်ပျူတာထဲမှာပဲ offline သိမ်းဆည်းတာ နေ့စဉ် ဝင်ငွေ၊ ထွက်ငွေ၊ အလုပ်က အမြတ်တွေကို မှတ်သားလို့ရတယ်။

တကယ်လို့ ကိုယ်က Creator ဆိုရင် page ကနေ ဝင်တဲ့ income, outcome, post kpi တွေကို တစ်နေရာတည်းကနေ Visualization ကောင်းအောင် dashboard နဲ့ တစ်နေရာတည်းမှာ ကြည့်လို့ရတယ်။

---

## 📥 Download & macOS Setup (Gatekeeper Fix)

[GitHub Releases](https://github.com/sanlinhtik3/sitku/releases/latest) ကနေ Mac (`.dmg`) သို့မဟုတ် Windows (`.exe`) ကို ဒေါင်းလုဒ် ရယူနိုင်ပါတယ်။

> [!IMPORTANT]
> **macOS မှာ "App is damaged and can't be opened" လို့ ပြလာရင် -**
> အင်တာနက်က ဒေါင်းလုဒ်ဆွဲထားတဲ့ Open-source App ဖြစ်လို့ macOS Gatekeeper က ယာယီ ပိတ်ဆို့ထားတာ (Quarantine) ဖြစ်ပါတယ်။ App တကယ် ပျက်စီးနေတာမျိုး **မဟုတ်ပါ**။
> 
> **ဖြေရှင်းနည်း (၃၀ စက္ကန့်) -**
> 1. `Sitku.app` ကို **Applications** Folder ထဲ ဆွဲထည့်ပါ။
> 2. **Terminal** ကို ဖွင့်ပြီး အောက်က Command ကို Run ပါ -
> ```bash
> xattr -cr /Applications/Sitku.app
> ```
> 3. ပြီးရင် Sitku App ကို ပုံမှန်အတိုင်း ဖွင့်သုံးလို့ ရပါပြီ။ (နောက်တစ်ခါ ဖွင့်တိုင်း တန်းပွင့်သွားပါမယ်!)

---

## 🚀 Quickstart & Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- macOS (Apple Silicon M-series recommended) or Windows 10/11

### Local Installation

```bash
# 1. Clone the repository
git clone git@github.com:sanlinhtik3/sitku.git
cd sitku

# 2. Install dependencies
npm install

# 3. Start Desktop App with Live Hot-Reload
npm run desktop:dev
```

---

## 🛠️ Build Commands

| Command | Description |
| :--- | :--- |
| `npm run desktop:dev` | Launches Vite dev server + Electron with instant hot-reloading. |
| `npm run desktop` | Compiles the production bundle (`dist/`) and launches Electron. |
| `npm run dist:mac:arm64` | Packages a native macOS Apple Silicon (`.dmg` / `.app`) installer. |
| `npm run dist:win` | Packages a Windows NSIS Setup Installer (`.exe`). |
| `npm run build` | Builds static PWA / Web release bundle. |

---

## 📂 Local Storage Architecture (`~/.sitku`)

```text
~/.sitku/
 ├── app.json             # Global application configuration & vault history
 ├── appearance.json      # UI themes, custom fonts, and accent settings
 ├── workspace.json       # Layout panels, open tabs, and bookmarks
 ├── core-plugins.json    # Active AI skills and agent feature toggles
 ├── sitku-agent.sqlite   # Local SQLite memory engine & vector embeddings
 ├── themes/              # Custom user-created CSS themes
 └── vault/               # Primary local markdown knowledge base
```

---

## 📄 License & Versioning

- **Version:** Calendar Versioning (`YYYY.M.D` e.g., `2026.7.5`)
- **Official Portal:** [sitku.space](https://sitku.space)
- **Author:** ZOE & Sitku Contributors
