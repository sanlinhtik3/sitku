# FUI HUD Design System

FUI HUD is Sitku's reusable, theme-aware interface system for dense operational
work. It provides presentation contracts only; product data, routing, and
business behavior remain in each feature.

## Public API

Import new code from the package boundary:

```tsx
import {
  FUI_LAYOUT,
  FUI_TOKENS,
  FuiMetricTile,
  FuiPanel,
  FuiSectionHeader,
} from "@/design-system/fui";
```

`@/components/ui/fui` remains as a compatibility alias for existing code.

## Foundations

- Canvas: quiet and unframed. Never paint a repeating grid on the app canvas.
- Structure: use thin semantic boundaries, not decorative nested cards.
- Signal: reserve the primary signal for focus, progress, selection, and key data.
- Data: use tabular numerals and one primary metric per tile.
- Status: pair color with visible text; never communicate state with color alone.
- Motion: communicate state change only and honor reduced-motion preferences.
- Accessibility: keep 44px touch targets, visible focus, and semantic labels.

## Components

- `FuiPanel`: `primary`, `secondary`, or `quiet` information boundary.
- `FuiSectionHeader`: title, context, description, and compact action.
- `FuiLabel`: supporting metadata.
- `FuiMetric`: tabular numeric emphasis.
- `FuiMetricTile`: compact one-metric dashboard widget.
- `FuiBadge`: compact semantic state.
- `FuiStatus`: text plus a non-color marker.
- `FuiProgress`: bounded and accessible progress.

## Layout recipes

`FUI_LAYOUT` provides responsive, product-neutral recipes for metric grids,
dashboard grids, toolbars, and compact stacks. Feature modules may choose column
spans, but must not redefine token colors, radii, shadows, or status meaning.

## Token rules

Use `FUI_TOKENS` when inline styles or chart configuration needs a CSS value.
The canonical theme compiler owns the underlying values. Do not hardcode a
primary color, neutral border, radius, or shadow in a feature.

`chartGrid` is legal only inside a chart plotting region. Layout grids organize
components but are never painted onto the product canvas.

## Example

```tsx
<section className={FUI_LAYOUT.metricGrid}>
  <FuiMetricTile
    label="Net"
    value="THB 24K"
    detail="This month"
    status="success"
    statusLabel="On target"
  />
</section>
```
