---
status: accepted
---

# Keep Electron with a macOS SwiftUI and AppKit native chrome shell

Sitku will keep Electron as its desktop runtime and React/CodeMirror as its content renderer. On macOS, a narrow native bridge will attach public AppKit and SwiftUI surfaces to the Electron `BrowserWindow` native `NSWindow`, giving the app a genuine native chrome shell without replacing the renderer with `WKWebView`.

## Ownership

- Electron main remains the application runtime and owns lifecycle, files, SQLite, secrets, permissions, updates, recovery, MCP, and background services.
- React and CodeMirror remain inside the Electron Chromium renderer and own content presentation and ephemeral UI state.
- The macOS bridge uses AppKit plus SwiftUI `NSHostingView` for native titlebar, toolbar, sidebar chrome, sheets, menus, and other shell-level surfaces where native behavior materially improves UX.
- Preload exposes a typed, capability-scoped API between the renderer and Electron main. A separate typed bridge connects Electron main to the macOS native shell.
- Windows keeps the Electron shell and equivalent platform-native Electron integrations. macOS-only Swift code must not leak into shared product logic.

## Boundaries

- This decision does not migrate the main renderer to `WKWebView`.
- SwiftUI does not own the note editor, Personal CFO, Agent Consultant, charts, or other content-heavy application views.
- The native bridge must use public APIs, fail safely when unavailable, and preserve a complete Electron-only fallback.
- Native window integration is version-sensitive and must be covered by macOS smoke tests before every Electron upgrade.
- Existing Markdown, repository contracts, MCP behavior, and local-first data remain compatible.

## Quality Contract

The native shell is accepted only when it measurably improves window behavior, keyboard navigation, accessibility, responsive layout, interaction latency, memory use, and recovery. It must never make the renderer less stable or put existing user data at risk.
