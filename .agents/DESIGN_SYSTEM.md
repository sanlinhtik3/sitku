# Sitku / BeeBot — AI Agentic Coding Design System

This document is the authoritative design specification and token reference for AI agents modifying or creating UI components in the Sitku / BeeBot workspace. Always adhere to these specifications to maintain our Apple 2030 minimalist-futuristic aesthetic.

## 1. Aesthetic Direction: "Apple 2030"
- **Vibe:** Calm, minimalist-futuristic, premium, near-black canvas with ambient glows, hairline borders, and glassmorphic panels.
- **Negative Space:** Generous breathing room; avoid cluttered or dense layouts unless explicitly building dense desktop toolbars (Codex-style).
- **Motion:** Subtle, smooth transitions (`0.15s` to `0.3s cubic-bezier(.2,.8,.2,1)`). Use micro-animations (hover lifts, pulsing status dots, equalizer bars) to make the surface feel alive.

## 2. Color Tokens
- **App Canvas:** `#060607` (near-black) or `#0a0a0b`.
- **Primary Brand Accent (`--ac`):** `#f4d35e` (warm gold). Runtime-themeable.
  - Accent text on dark: `var(--ac)`.
  - Accent button text (on gold): `#1a1205` or `#000000`.
- **Feature Accents:**
  - **Notes / Voice:** Warm Gold (`#f4d35e`).
  - **Agent Consultant:** Sky Blue (`#7dd3fc` or `#7AA2FF`).
  - **Personal CFO / Finance:** Mint Green (`#6ee7b7` or `#5BD6A0`).
  - **Status Green:** `#34c759` (Pills, live indicators).
  - **Warning / Alert:** `#fbbf24` (Amber/Yellow).
  - **Detail / Secondary Accent:** Purple (`#c792ea`).
- **Text Palette:**
  - Headings: Pure `#ffffff` or Gradient (`linear-gradient(180deg,#fff,#9fa0a8)`).
  - Primary Body: `#ededef`.
  - Secondary Body: `#a4a4aa`.
  - Muted: `#8a8a8e`.
  - Faint / Border details: `#7a7a7c` to `#6a6a6c`.
- **Glassmorphic Fills:**
  - Navigation / Bars: `rgba(14, 14, 17, 0.62)` or `rgba(20, 22, 28, 0.6)`.
  - Cards / Bento: `linear-gradient(180deg, rgba(22,23,28,0.6), rgba(14,14,18,0.6))`.
  - CTA / Modals: `linear-gradient(180deg, rgba(24,25,30,0.7), rgba(12,12,16,0.7))`.
- **Hairline Borders:**
  - Default: `0.5px solid rgba(255, 255, 255, 0.08)` to `0.09`.
  - Hover / Active / Emphasis: `0.5px solid rgba(255, 255, 255, 0.12)` to `0.16`.

## 3. Typography & Scale
- **Font Family:** `Inter Variable`, `Inter`, `-apple-system`, `system-ui`, `sans-serif`.
- **Feature Settings:** `'cv11', 'ss01', 'cv01'`.
- **Tracking:** `-0.014em` to `-0.006em` for body; `-0.035em` to `-0.045em` for display headers.
- **Display H1 (Hero):** `clamp(44px, 7.4vw, 104px)`, weight `720`, line-height `0.98`.
- **Section H2:** `clamp(30px, 4.4vw, 52px)`, weight `700`, line-height `1.04`.
- **Eyebrow / Labels:** `12px` to `13px`, weight `600`, tracking `0.04em`, uppercase, accent-colored.
- **Gradient Text Rule:**
  ```css
  background: linear-gradient(180deg, #fff, #a8a8b0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  ```

## 4. Radii & Shadows
- **Border Radii:**
  - Pills / Badges: `999px` (full rounded).
  - Large Cards / Windows / Modals: `20px` to `28px`.
  - Navigation / Sidebars: `18px` to `22px`.
  - Controls / Buttons / Tags: `11px` to `16px`.
- **Shadows:**
  - Nav: `0 10px 40px -18px rgba(0, 0, 0, 0.7)`.
  - Floating Cards: `0 30px 80px -24px rgba(0, 0, 0, 0.7)`.
  - Hero Window: `0 40px 120px -30px rgba(0, 0, 0, 0.8), inset 0 -1px 0 rgba(255, 255, 255, 0.06)`.
  - Primary CTA Hover: `0 12px 34px -8px color-mix(in oklab, var(--ac) 55%, transparent)`.

## 5. Glass & Backdrop Filter
- **Standard Recipe:**
  ```css
  backdrop-filter: blur(28px) saturate(170%);
  -webkit-backdrop-filter: blur(28px) saturate(170%);
  background-color: rgba(20, 22, 28, 0.6);
  border: 0.5px solid rgba(255, 255, 255, 0.08);
  ```

## 6. Iconography
- **Library:** `@solar-icons/react` (Linear weight by default; Bold for primary brand marks or active states).
- **Size Rhythm:**
  - Toolbar / Inline: `14px` to `18px`.
  - Card Headers / Tiles: `20px` to `24px`.
- **Coloring:** Match the feature accent (Gold for Notes, Sky for Consultant, Mint for CFO).

## 7. AI Agent Guidelines (Ponytail Rules)
1. **No generic colors:** Never use plain red, green, or blue. Use the tailored HSL/HEX tokens above.
2. **No clumsy utility bloat:** Use clean styles or Tailwind classes that map precisely to these design tokens.
3. **Preserve existing UI:** When updating a component, keep hairline borders, glassmorphic blur, and icon consistency intact.
4. **YAGNI / Deletion over addition:** Do not add speculative UI wrappers or unnecessary DOM nesting. Keep the DOM tree flat and clean.
