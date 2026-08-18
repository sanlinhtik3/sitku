# Sitku FUI HUD Theme

`FUI HUD` is a dark, context-aware visual language for Sitku Notes, Personal CFO,
Agent Consultant, and Settings. It translates the supplied tactical interface
references into a readable product UI; it is not a cinematic replica.

## Design contract

- Neutral surfaces carry most of the interface. Cyan/mint marks focus, progress,
  selection, and high-signal values.
- App and product-room canvases stay visually quiet. Repeating graph-paper grids
  are prohibited; measurement grids belong only inside charts and data widgets.
- Notes keep an unframed writing canvas. Technical framing is limited to chrome,
  context, and status.
- CFO and Consultant use denser metric, chart, table, and status presentation.
- Settings prioritizes grouping, explicit selection, and keyboard visibility.
- Status meaning always includes text or an icon; color is supplementary.
- Continuous scan, glitch, particle, and decorative animation are prohibited.

## Architecture

The built-in theme has the ID `fui-hud-001` and family `fui-hud`. The family is
preserved when a user creates a personal copy, so its component language remains
active while colors, radius, borders, and surfaces are customized.

`applyThemeVariables` remains the canonical compiler. The reusable public API
lives in `src/design-system/fui`; `src/components/ui/fui.tsx` is a compatibility
alias. Business logic and data fetching stay in their existing feature modules.

Implementation and usage examples are documented in
`src/design-system/fui/README.md`.

## Token contract

The canonical theme compiler owns color, radius, shadow, sidebar-edge, and
legacy product aliases. The FUI family adds only presentation tokens:

- Surfaces: `--fui-canvas`, `--fui-surface`, `--fui-surface-raised`, and
  `--fui-panel-fill`.
- Lines: `--fui-line` for neutral structure, `--fui-line-strong` for the
  active/high-signal boundary, and `--fui-chart-grid` only for guides inside a
  chart plotting region.
- Signal: `--fui-signal` (primary), `--fui-signal-cool` (supporting data), and
  the existing semantic success/warning/danger tokens.
- Scale: `--fui-space-1` through `--fui-space-4`, plus the compiled control and
  panel radius tokens.
- Motion: `--fui-motion-fast`, `--fui-motion-normal`, and `--fui-ease`.

No component may introduce a product-specific primary color, neutral border,
radius, or shadow outside these compiled tokens. Semantic data colors remain
allowed because they communicate meaning rather than decoration.

## Shared primitives

- `FuiPanel`: primary, secondary, and quiet information surfaces.
- `FuiLabel`: compact technical metadata.
- `FuiMetric`: tabular numeric emphasis.
- `FuiStatus`: text plus a non-color status marker.
- `FuiProgress`: accessible bounded progress with a numeric summary.
- `FuiSectionHeader`: title, optional technical eyebrow, description, and a
  compact action slot that stacks safely on mobile.
- `FuiBadge`: compact semantic state label for selected, success, warning, and
  danger states.

All primitives are theme-safe outside the FUI family and use the existing Sitku
token compiler. Motion respects `prefers-reduced-motion`.

## Layout and behavior rules

- Notes are calm and writing-first; only chrome and status use the FUI frame.
- CFO and Consultant may use denser numeric grids, but one primary metric per
  tile and no decorative data chrome.
- Layout grids organize panels without being painted onto the canvas. Chart
  guides remain scoped to the chart plotting region.
- Panels use `FuiPanel` only for a meaningful information boundary. Do not nest
  panels solely for visual effect.
- Status always has text, an icon, or both. A color alone must not carry state.
- Desktop uses compact grids; mobile stacks headers/actions before content and
  retains at least 44px interactive targets.
- FUI transitions describe a real state change only. Reduced-motion disables
  decorative transitions.

## Regression checklist

- Apply FUI, a personal FUI copy, another custom theme, and System Default in
  sequence. No family marker or CSS variable may remain stale.
- Confirm Notes, CFO, Consultant, Settings, chart axes, keyboard focus, and
  mobile header/action layouts inherit the active tokens.
- Confirm semantic positive, warning, and negative values retain a text or icon
  distinction in addition to color.
