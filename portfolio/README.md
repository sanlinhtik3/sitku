# Handoff: Sitku — Marketing Landing Page

## Overview
A public marketing landing page for **Sitku** — a local-first, agent-native "second brain"
workspace (a Notion/Obsidian-class app). The page introduces the product and its four
pillars — **Notes**, **Agent Consultant**, **Personal CFO**, and **Voice Command** — and
drives to a download/sign-up CTA.

Aesthetic direction: **Apple (macOS / iOS / iPadOS) minimalist-futuristic, "2030"** — a flat
near-black canvas, ambient colored glows, hairline borders, glassmorphic panels, large
gradient-clipped display type, generous negative space, and one well-orchestrated set of
scroll-reveal animations. It is intentionally calm and premium, not busy.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype
that shows the intended look, motion, and behavior. **They are not production code to ship
directly.** Your task is to **recreate this design in the target codebase's environment**
using its established patterns and libraries. This project is a Vite + React + Tailwind +
shadcn-ui app (`cute-ai-agent`); build the landing page as a React route/page there (e.g.
`src/pages/Landing.tsx` + section components), using Tailwind for styling and the existing
`@solar-icons/react` package for icons. If you implement in a different stack, keep every
value below identical.

The hero embeds the **real Notes app** as a live, interactive preview. In the prototype this
is an `<iframe>` pointing at the sibling `Note App - Improved.dc.html`. In the real app, embed
the **actual Notes workspace route** (the redesigned `KnowledgeWorkspacePage`) — either as a
live scaled component instance or, if that's too heavy for a marketing page, a non-interactive
high-res render/video. See "Hero" below.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, motion, and copy are final and
specified below. Reproduce them precisely.

---

## Design Tokens

**Color**
- App canvas: `#060607` (near-black). Section-card fills use translucent dark glass over this.
- Accent (brand): `--ac` = `#f4d35e` (warm gold). Runtime-themeable; alt options used in the
  prototype: `#7AA2FF`, `#5BD6A0`, `#C792EA`.
- Accent-on-dark text/detail: `var(--ac)`; accent button text (on gold): `#1a1205`.
- Feature accents: Notes/Voice = gold `#f4d35e`; Agent Consultant = sky `#7dd3fc`; Personal
  CFO = mint `#6ee7b7`. Status green: `#34c759`. Warning: `#fbbf24`. Purple detail: `#c792ea`.
- Text: headings pure `#ffffff` → gradient to `#9fa0a8` (see display treatment); primary
  `#ededef`; secondary body `#a4a4aa`; muted `#8a8a8e`; faint `#7a7a7c`; dim `#6a6a6c`.
- Glass panel fills: `rgba(14–24, …, 0.6–0.7)` — e.g. nav `rgba(14,14,17,0.62)`, bento
  `linear-gradient(180deg, rgba(22,23,28,0.6), rgba(14,14,18,0.6))`, CTA card
  `linear-gradient(180deg, rgba(24,25,30,0.7), rgba(12,12,16,0.7))`.
- Hairline borders: `0.5px solid rgba(255,255,255,0.09)` (rest) → `0.12`–`0.16` (emphasis/hover).

**Typography**
- Family: **Inter Variable** (`rsms.me/inter`), `font-feature-settings: 'cv11','ss01','cv01'`,
  `-webkit-font-smoothing: antialiased`. Base tracking `-0.014em`.
  *(If you want to push the Apple feel further, SF Pro Display is the natural substitute for
  the big display type; Inter tight is the on-brand default and matches the app.)*
- Display H1 (hero): `clamp(44px, 7.4vw, 104px)`, weight `720`, `line-height 0.98`,
  `letter-spacing -0.045em`, max-width `1000px`.
- Section H2: `clamp(30px, 4.4vw, 52px)`, weight `700`, `letter-spacing -0.035em`, `line-height 1.04`.
- Feature H2: `clamp(30px, 3.9vw, 46px)`, weight `700`, `-0.035em`.
- CTA H2: `clamp(34px, 5.2vw, 60px)`, weight `730`, `-0.04em`.
- Eyebrow/labels: `12.5–13px`, weight `600`, `letter-spacing 0.04em`, `text-transform: uppercase`, accent-colored.
- Body/lede: `16–20px`, weight `450`, `line-height 1.5–1.6`, color `#a4a4aa`.
- **Gradient text treatment** (H1, section/CTA H2): `background: linear-gradient(180deg,#fff,#a8a8b0)`
  (CTA: `#fff → #b0b0b8`; hero: `#fff 30% → #9fa0a8`), `-webkit-background-clip:text; background-clip:text; color:transparent`.

**Radii**: pill `999px`; large card / CTA `20–28px`; nav / window `18–22px`; control / tag `11–16px`.

**Shadows**
- Nav: `0 10px 40px -18px rgba(0,0,0,0.7)`.
- Floating product card: `0 30px 80px -24px rgba(0,0,0,0.7)`.
- Hero window: `0 40px 120px -30px rgba(0,0,0,0.8)`, plus `inset 0 -1px 0 rgba(255,255,255,0.06)`.
- Primary CTA hover: `0 12px 34px -8px color-mix(in oklab, var(--ac) 55%, transparent)`.

**Glass**: `backdrop-filter: blur(20–30px) saturate(170%)` (+ `-webkit-` prefix) on nav, cards, window.

**Spacing rhythm**: content max-width `1120px`, side padding `24px`. Section vertical gaps
~`130–170px`. Two-column feature sections: `grid-template-columns:1fr 1fr; gap:56px; align-items:center`.

---

## Screens / Views
Single long-scroll page, `max-width:1120px` centered container, on the `#060607` canvas with
three ambient radial glows (gold top-center; blue top-right drifting; purple mid-left drifting
— `animation: drift 16–20s ease-in-out infinite`).

### 1. Sticky Nav
- Sticky, `z-index:50`, centered; inner bar `max-width:1120px`, glass fill `rgba(14,14,17,0.62)`
  + blur, `border:0.5px solid rgba(255,255,255,0.09)`, `border-radius:18px`, padding `10px 12px 10px 20px`.
- **Left**: gold gradient mark tile (`26px`, `radius:8px`, `linear-gradient(140deg, var(--ac), color-mix(var(--ac) 46%, #000))`, Solar `notebook-bold` glyph in `#1a1205`) + wordmark "Sitku" (`16px / 680 / -0.03em`).
- **Center**: links Notes · Agents · Finance · Voice (`13.5px / 500`, `#9a9aa0` → `#f2f2f4` on hover, `.18s`), anchor to `#notes / #consultant / #cfo / #voice`.
- **Right**: "Sign in" text link + **"Get Sitku"** pill (`38px` tall, gold bg, `#1a1205`, `radius:12px`).

### 2. Hero
- Centered, padding `78px 24px 0`.
- **Eyebrow pill**: "NEW" gold chip + "Introducing Sitku — your second brain, with agents" + right chevron.
- **H1**: "The workspace that thinks with you." (gradient display treatment).
- **Lede**: "Notes, agents, and your finances — orchestrated on one calm, local-first surface. Built for the way your mind actually works." (`max-width:600px`).
- **CTAs**: primary gold "Get started — free" (`52px`, `radius:15px`, arrow icon) + ghost "Watch the film" (`0.5px` border, play-circle icon in accent).
- **Trust row**: three items with Solar icons — "Private by design" (`shield-check`, mint), "Local-first" (`server`, sky), "Agent-native" (`magic-stick-3`, gold).
- **Hero product window (LIVE):** a laptop-style frame, `max-width:1060px`, `border-radius:22px 22px 0 0`, `0.5px` top/side border (no bottom — it bleeds into the page), glass bg, big shadow, `overflow:hidden`. Above it: a small **"● Live — hover, click a note, open search"** pill with a pulsing green dot.
  - Inside: the **real Notes workspace**, shown at desktop scale. In the prototype this is
    `<iframe src="Note App - Improved.dc.html">` sized `1440×860` and `transform:scale(0.7347)`
    (`transform-origin: top left`) inside a `632px`-tall clipped frame, `loading="lazy"`.
  - **In production:** mount the actual redesigned Notes route (see the companion handoff
    `design_handoff_note_app`) here as a live instance so hover/click/tab/search all work, OR —
    if mounting the full app on a marketing page is undesirable — use a crisp static render or
    a muted autoplaying screen-capture video framed identically. The intent is "the real app,
    emerging out of the hero."

### 3. Bento — "Four minds, working as one."
- Centered heading block: eyebrow "One surface", H2 (gradient), lede.
- 12-col grid, `gap:16px`, four cards each `grid-column: span 6` (2×2). Card: `radius:20px`,
  `0.5px` border, glass gradient fill, `padding:22px`, hover `translateY(-3px)` + brighter border
  (`.3s cubic-bezier(.2,.8,.2,1)`). Each links to its section anchor.
- Card header: `38px` rounded icon tile (feature-tinted bg + ring), title (`15.5px / 640`) + tag (`12px`, faint).
- Card body copy (`14px`, `#a4a4aa`), then a **mini visual** pinned to the bottom:
  - **Notes** — faux note lines + two gold `[[wikilink]]` chips.
  - **Agent Consultant** — a sky assistant bubble ("Bottleneck · TikTok ER 2.1%…") + a user bubble.
  - **Personal CFO** — 6 mini bars, the peak bar mint-gradient, `barGrow .8s` staggered.
  - **Voice Command** — a pulsing gold orb with two expanding rings (`ring 2s` infinite).
- Copy per card:
  - Notes / "Local-first editor" — "Wikilinks, backlinks, and an outline that writes itself. Think in connected ideas."
  - Agent Consultant / "Strategy on call" — "Diagnoses your numbers and returns a plan — bottleneck, leverage, next move."
  - Personal CFO / "Income intelligence" — "Track sources, margins, and momentum. Know what changed and why."
  - Voice Command / "Hands-free capture" — "Summon Sitku with a word. Capture, query, or dispatch an agent by voice."

### 4. Notes (deep-dive, `#notes`)
- Two-column: left text, right floating visual.
- Eyebrow "Notes" (gold, notebook icon), H2 "Notes that connect themselves.", lede, then a 3-item
  feature list (each: `26px` gold-tinted icon tile + title `14.5px/580` + `13.5px` muted body):
  - Bidirectional links — "Every mention becomes a backlink. Your vault forms its own graph." (`link`)
  - Inline agents — "Select text, ask Sitku — summarize, rewrite, or turn it into tasks." (`magic-stick-3`)
  - Spotlight search — "Jump anywhere with ⌘K. Notes, commands, and links in one field." (`magnifer`)
- Right visual: a floating glass note card (`radius:20px`, blur, `floaty 7s` bob) — title "BeeBot
  Architecture", status pill + `#agent` tag, "Backlinks · 3" and three backlink rows.

### 5. Agent Consultant (deep-dive, `#consultant`)
- Two-column **reversed** (`order:2` text right, `order:1` visual left). Sky accent.
- Eyebrow "Agent Consultant" (chat icon), H2 "A strategist, always on call.", lede about
  diagnosis (bottleneck / leverage / next move; SWOT, Pareto, Porter), then three chips:
  "Weekly diagnosis", "30-day forecast", "Bottleneck finder".
- Left visual: floating glass card (`floaty 8s`) — two KPI tiles (Week ROI 288% +42.5%, Engage
  84.5K +18.4%, left color bars) + a mint area-line sparkline (7 pts, `linearGradient` fill) +
  a "Next · Repurpose the top YouTube script into 3 TikTok hooks." agent line.

### 6. Personal CFO (deep-dive, `#cfo`)
- Two-column: left text, right visual. Mint accent.
- Eyebrow "Personal CFO" (wallet icon), H2 "Every number, understood.", lede, then two big stats:
  "+18.4%" (mint) "Income vs last week" · divider · "74.3%" "Net margin".
- Right visual: floating glass card (`floaty 7.5s`) — "This week income / 2.4M Ks" + "+18.4%"
  pill, four labeled progress bars (Client A 56% mint, Products 24% sky, Crypto 12% gold, Other
  8% purple), and a warning insight ("Client A is 56% of income — concentration risk.", `danger-triangle`).

### 7. Voice Command (deep-dive, `#voice`, centered)
- Centered, `max-width:900px`. Large radial gold glow behind.
- **Orb**: `168px` stage, three concentric accent rings (`ring 3s` staggered 0/1/2s) around a
  `112px` gold sphere (radial-gradient highlight, glow shadow, `orbPulse 3s`) with a Solar
  `microphone-bold` glyph in `#1a1205`.
- Eyebrow "Voice Command" (mic icon), H2 "Just think out loud.", lede.
- **Command pill**: glass pill with an animated 5-bar equalizer (`eq 1.1s` staggered) + the text
  `"Hey Sitku, summarize today's notes into three tasks"` (quotes/"Hey Sitku," in faint color).

### 8. Closing CTA (`#get`)
- Full-width glass card, `radius:28px`, `padding:76px 32px`, centered, big gold radial glow on top.
- H2 "Your second brain is ready." (gradient), lede, then primary "Download for Mac" (gold) +
  ghost "See pricing"; sub-note "Free forever for personal vaults · macOS, iOS & iPad".

### 9. Footer
- Top hairline. Left: mark + wordmark + one-line description. Right: three link columns
  (Product / Company / Resources). Bottom row: "© 2030 Sitku. Crafted for calm minds." + Privacy /
  Terms / Status. All links `13.5px`, `#9a9aa0` → `#f2f2f4` hover.

---

## Interactions & Behavior
- **Scroll reveal**: every `.reveal` element starts `opacity:0; translateY(26px)` and animates to
  visible on entering the viewport (IntersectionObserver, `threshold 0.12`, `rootMargin 0 0 -8% 0`),
  `transition: opacity/transform .9s cubic-bezier(.16,.7,.2,1)`, with a small stagger
  (`transition-delay: min(i,6)*60ms`). **Progressive enhancement:** the hidden state is only
  applied once JS adds a `.js` class to the root, so with JS disabled everything is visible. A
  2.5s fallback timer reveals all in case the observer misses. In React, do this with an
  `IntersectionObserver` in an effect (or a small `useReveal` hook / `framer-motion whileInView`).
- **Nav links** smooth-scroll to section anchors.
- **Hover**: nav links + footer links lighten (`.18s`); primary CTAs lift `translateY(-1px)` + gold
  glow shadow (`.2s`); ghost buttons brighten bg/border; bento cards lift `-3px` + brighter border (`.3s`).
- **Ambient motion**: two background glow blobs `drift` (16s / 20s, one reversed); product cards
  `floaty` bob (7–8s); voice orb `orbPulse` + expanding `ring`s; equalizer + waveform bars loop.
- **Hero live app**: full interactivity comes from the embedded Notes workspace itself (clicking
  notes, switching tabs, Assistant/Outline/Links segmented control, ⌘K search) — the landing page
  just frames and scales it.
- **Responsive**: below ~900px, collapse the two-column feature sections to single column (stack
  visual under text), reduce the bento to 1–2 columns, and consider replacing the live hero embed
  with a static render. Type already fluid via `clamp()`.

## State Management
The landing page is essentially **stateless** presentational UI. The only "state" is:
- Reveal-on-scroll visibility (observer-driven class toggle) — local, no store needed.
- One optional theme accent value (`--ac`) if you expose the brand-color switch (the prototype
  has it as a tweakable prop; default `#f4d35e`).
- The embedded Notes app owns its own state (active note, tabs, panel tab, search) — unchanged.

## Assets — Icons
Solar icon set. In the prototype they load via Iconify (`solar:*`); in the app use the installed
`@solar-icons/react` package (`weight="Linear"` unless noted **Bold**):
- Nav/footer mark: `Notebook` (Bold). Hero eyebrow: `AltArrowRight`. CTAs: `ArrowRight`, `PlayCircle`.
- Trust row: `ShieldCheck`, `Server`, `MagicStick3`.
- Bento tiles: `Notebook`, `ChatRoundLine`, `Wallet`, `Microphone`.
- Notes features: `Link`, `MagicStick3`, `Magnifer`. CFO/consultant: `ArrowRightUp`, `DangerTriangle`,
  `Plain2` (send), `MagicStick3`. Voice orb: `Microphone` (Bold).
No raster/image assets — all visuals are CSS/SVG. Fonts: Inter Variable via `rsms.me/inter`.

## Files (in this bundle)
- `Sitku - Landing.dc.html` — the hifi landing-page design reference (open in a browser to see
  layout, motion, and hover/scroll behavior; the hero embeds the Notes app live).
- `Note App - Improved.dc.html` — the Notes workspace embedded in the hero (its own full handoff
  lives in `design_handoff_note_app`).
- `support.js` — runtime for the two `.dc.html` prototypes (reference only; not for production).

## Implementation order (suggested)
1. Page scaffold: canvas bg + three ambient glow layers + centered `1120px` container.
2. Sticky glass nav.
3. Hero (eyebrow, gradient H1, lede, CTAs, trust row) — static frame first.
4. Bento grid + the four mini visuals.
5. The four deep-dive sections (reuse a `<FeatureRow reversed?>` component + floating glass cards).
6. Voice section (orb + command pill) and closing CTA + footer.
7. Scroll-reveal observer + hover/ambient animations.
8. Hero live embed: mount the real Notes route (scaled) or a static render/video.
9. Swap Iconify glyphs for `@solar-icons/react`; wire the accent color to your theme.
