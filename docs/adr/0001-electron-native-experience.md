---
status: superseded by ADR-0002
---

# Keep Electron and build a native-feeling desktop experience

Sitku will keep Electron as its desktop runtime. We will improve the existing React/Electron application through disciplined process ownership, AppKit- and SwiftUI-informed interaction design, responsive layouts, resilient local data handling, and native Electron/macOS integrations instead of migrating to Tauri, a SwiftUI/WKWebView shell, or a full native rewrite.

## Boundaries

- The React renderer owns presentation and ephemeral UI state.
- The preload exposes a small, typed, capability-scoped bridge.
- The Electron main process owns windows, native menus, files, SQLite, secrets, permissions, updates, and lifecycle recovery.
- Heavy or failure-prone voice and background work runs outside the renderer in utility processes or dedicated services.
- AppKit and SwiftUI are interaction and visual-system references. A narrow macOS helper is allowed only when Electron cannot provide a required public native API.
- Existing Markdown, repository contracts, MCP behavior, Personal CFO, Agent Consultant, and local-first data must remain compatible.
- Tauri, a SwiftUI/WKWebView replacement shell, and a wholesale UI rewrite are rejected unless this ADR is explicitly superseded.

## Quality Contract

Native-feeling changes must improve measured startup, typing, interaction latency, accessibility, responsive behavior, memory use, and crash recovery. Visual resemblance alone is not sufficient, and no migration may risk existing user data.
