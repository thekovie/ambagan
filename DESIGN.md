---
name: ambagan
description: Split it, settle it. Monthly shares as tingi sachets hung on a rack.
colors:
  ink: "oklch(0.2 0.045 290)"
  paper: "oklch(0.975 0.01 290)"
  foil-magenta: "oklch(0.55 0.24 5)"
  foil-cobalt: "oklch(0.5 0.23 268)"
  foil-tangerine: "oklch(0.77 0.17 60)"
  foil-lime: "oklch(0.87 0.2 128)"
  on-foil-magenta: "oklch(0.99 0.005 5)"
  on-foil-cobalt: "oklch(0.99 0.005 268)"
  card-light: "oklch(1 0 0)"
  secondary-light: "oklch(0.935 0.018 290)"
  muted-light: "oklch(0.945 0.014 290)"
  muted-foreground-light: "oklch(0.44 0.035 290)"
  border-light: "oklch(0.86 0.022 290)"
  input-light: "oklch(0.8 0.03 290)"
  destructive-light: "oklch(0.52 0.22 25)"
  ground-dark: "oklch(0.155 0.035 290)"
  text-dark: "oklch(0.96 0.012 290)"
  card-dark: "oklch(0.205 0.04 290)"
  secondary-dark: "oklch(0.26 0.045 290)"
  muted-foreground-dark: "oklch(0.76 0.03 290)"
  border-dark: "oklch(0.34 0.045 290)"
  input-dark: "oklch(0.45 0.05 290)"
  ring-dark: "oklch(0.8 0.14 268)"
  destructive-dark: "oklch(0.72 0.19 22)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3.75rem, 19vw, 6rem)"
    fontWeight: 850
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 850
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 62"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 850
    lineHeight: 0.95
    fontVariation: "'wdth' 62"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    letterSpacing: "0.01em"
  reference:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Menlo, monospace"
    fontSize: "0.8rem"
    letterSpacing: "-0.025em"
rounded:
  sachet: "0.5rem"
  base: "0.75rem"
  pill: "999px"
spacing:
  rack-gap: "1.75rem"
  touch: "44px"
  shell-rail: "15.5rem"
components:
  button-default:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  button-foil:
    backgroundColor: "{colors.foil-magenta}"
    textColor: "{colors.on-foil-magenta}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  status-pill:
    backgroundColor: "{colors.foil-cobalt}"
    textColor: "{colors.on-foil-cobalt}"
    rounded: "{rounded.pill}"
    height: "28px"
    padding: "0 5.6px 0 11.2px"
  sachet:
    backgroundColor: "{colors.foil-cobalt}"
    textColor: "{colors.on-foil-cobalt}"
    rounded: "{rounded.sachet}"
  empty-state:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "40px 24px"
---

# Design System: ambagan

## Overview

**Creative North Star: "The Tingi Sachet Rack"**

Every month's share is a small foil strip hung on a rack, priced in huge condensed pesos and torn off when settled. The ground is quiet (cool foil-white in light, deep ink-violet in dark) so that flat, saturated foil fields carry all the colour and all the meaning. The silhouette does the branding: a crimped, perforated, notched strip is recognisable with the content removed.

Density is low and thumb-sized: one big sachet, then a rack of earlier strips, capsule controls at 44px. Depth is physical rather than decorative: foil strips lift off the ground with a soft drop shadow and hang slightly off true. Type is one family in two voices.

**Key Characteristics:**
- Flat foil colour fields on a violet-tinted neutral ground; foils are theme-independent.
- Status carried by edge form, icon and word as well as hue.
- Capsule (fully round) controls; sachets keep a small 0.5rem corner.
- One heavy condensed grotesk for pesos and headings, normal width for text.
- Magenta is reserved for the thing that needs doing now.

## Colors

Four saturated foils over ink-violet and foil-white neutrals; all neutrals are tinted toward hue 290.

### Primary
- **Ink Violet** (`ink`): text in light theme, the default button fill, text on tangerine and lime foils.
- **Foil White** (`paper`): light-theme ground; dark-theme ground is **Night Violet** (`ground-dark`).

### Secondary (the foils)
- **Magenta Foil** (`foil-magenta`): OVERDUE sachets, the `foil` pay-now button, sidebar-primary, wordmark glyph, dark-theme selection.
- **Cobalt Foil** (`foil-cobalt`): UNPAID sachets, light-theme focus ring.
- **Tangerine Foil** (`foil-tangerine`): UNDER_VERIFICATION sachets.
- **Lime Foil** (`foil-lime`): PAID sachets, light-theme text selection.

### Neutral
- Light: card (`card-light`), secondary and muted tints, muted text (`muted-foreground-light`), hairline border (`border-light`), stronger field border and rack rail (`input-light`), error (`destructive-light`).
- Dark: card (`card-dark`), secondary, text (`text-dark`), muted text, border, field border and rack rail (`input-dark`), pale-cobalt focus ring (`ring-dark`), error (`destructive-dark`).
- CANCELLED uses the muted surface with muted text and a dashed outline, no foil.

### Named Rules
**The Foil-Pair Rule.** Text on a foil uses its paired `on-foil-*` colour (white on magenta and cobalt, ink on tangerine and lime), in both themes. Never theme-flip text on a foil.

**The One Urgent Magenta Rule.** Magenta marks overdue and the single action that needs doing now. Do not use it for decoration or secondary actions.

**The Never-Colour-Alone Rule.** A status is always colour plus word plus icon plus edge form.

## Typography

**Display Font:** Archivo variable, narrow width axis (`wdth` 62), weight 850.
**Body Font:** Archivo variable at normal width.
**Label/Mono Font:** system monospace stack, used only for statement references.

**Character:** One family, two voices: a tall condensed shout for money and headings against calm normal-width text. Tabular numerals are on globally.

### Hierarchy
- **Display** (850, `clamp(3.75rem, 19vw, 6rem)`, 0.95): the peso amount on the current sachet; compact sachets use 3rem.
- **Headline** (850, 3rem to 3.75rem, 0.95): page titles.
- **Title** (850, 1.875rem, 0.95): section and empty-state headings. Headings use the `font-display` utility, with 0.12em word spacing.
- **Body** (600 to 700, 0.875rem): sachet meta lines, descriptions (max 38ch in empty states).
- **Label** (700, 0.8125rem to 0.875rem, +0.01em): pills, buttons, nav items. Sentence case.
- **Reference** (mono, 0.8rem): statement references such as SPOT-202610-A1B2C3.

### Named Rules
**The Peso Voice Rule.** Condensed heavy type is for amounts and headings only; running text never uses the narrow axis.

## Layout

Mobile first. Shell: slim 56px top bar (wordmark left, theme toggle right) and a fixed four-tab bottom bar for members (64px tall, safe-area aware); admin gets scrolling pill tabs under the top bar. From `md`: a sticky 15.5rem left rail with pill nav items and the account footer, content in a column capped at `max-w-5xl` with 2.5rem side padding. Content padding is 1rem on phones. Sachets stack in a `rack` with 1.75rem gaps under a rail line. Touch targets are 44px by default. Spacing follows Tailwind's 4px scale; there is no custom scale beyond the rack gap.

## Elevation & Depth

Hybrid: flat colour fields with a soft physical lift. Depth comes from the foil's drop shadow and a slight tilt on the rack, not from borders or layered cards.

### Shadow Vocabulary
- **Sachet lift** (`filter: drop-shadow(0 1px 0 oklch(0 0 0 / 0.1)) drop-shadow(0 10px 14px oklch(0.2 0.1 290 / 0.18))`): every sachet except CANCELLED (none, it is slack). Applied as a filter so it follows the notched silhouette.
- **Foil button glow** (`0 8px 16px -6px oklch(0.3 0.17 5 / 0.65)`, reduced on press): the magenta action only.
- **Inverse button shadow** (`0 8px 16px -6px oklch(0 0 0 / 0.4)`): the action on a coloured sachet.
- **Hang hole** (`inset 0 1px 2px oklch(0 0 0 / 0.35)`): punched hole on hung sachets.

### Named Rules
**The Follow-the-Silhouette Rule.** Shadows on sachets use `filter: drop-shadow`, never `box-shadow`, so notches and tears cast correctly.

## Shapes

Fully round capsules for every control and pill (999px); sachets use 0.5rem corners with 10px round notches at the perforation; the base radius token is 0.75rem (empty state, cards). Crimp seal: 0.7rem bands of fine vertical ridges (1.5px dark lines every 4px at 16% black) along the top and bottom edges of body and stub. Perforation: 2px dashed line at 45% transparent foreground colour. Rack: a 0.5rem rounded rail with strips alternately rotated about -0.5deg and 0.4deg. Edge forms by status: UNPAID stub attached; UNDER_VERIFICATION stub half torn (rotated 3deg, dropped 2px); PAID stub gone, scalloped torn edge; OVERDUE creased top-left corner (1.75rem); CANCELLED dashed outline with struck-through amount. Dashed borders (2px) mark an empty rack hook.

## Components

### Buttons
Capsule, 44px default height (`xs` 32, `sm` 36, `lg` 56), 700 weight, 200ms ease-out-expo transitions; press nudges 1px down and scales to 0.98. Focus: 3px ring at 60% ring colour with 2px background offset.
- **Default:** ink fill, paper text (inverts in dark).
- **Foil:** magenta fill, white text, glow shadow. Pay or submit only.
- **Inverse:** swaps the sachet's own foreground and background; the action on any coloured sachet.
- **Outline / Secondary / Ghost / Link / Destructive:** quiet variants for everything else.

### Status Pill
28px capsule: status word, then a trailing round chip holding a 3px-stroke icon (circle-dashed, hourglass, check, alert-triangle, ban). Fill follows the foil of the status; on its own sachet the pill inverts (sachet foreground as fill) so it never vanishes into the field.

### Sachet (signature)
Flex strip: body (subscription and period, pill, huge amount, due date and reference, action row) plus a perforated stub carrying the three-letter month, set vertically in display type. Edge forms and animation as in Shapes. On approval (`data-just-paid`) the stub tears away over 1s and the body settles with a 0.6s shift; reduced motion collapses all animation to instant.

### Navigation
Pill items. Active: foreground fill with background text. Inactive: sidebar text, tint on hover. Mobile member tabs: 48x28 pill behind a 1.15rem icon, active filled ink, inactive muted; label beneath.

### Empty State
A dashed-outline empty hook: 2px dashed border, 0.5rem-ish rounded, centred secondary-tinted round icon chip, display title, muted 38ch description, optional action.

### Wordmark
Lowercase "ambagan" in display type with a small magenta sachet SVG glyph (notched, perforated).

## Do's and Don'ts

### Do:
- **Do** pair every foil with its `on-foil-*` text colour in both themes.
- **Do** show status as word, icon, edge form and hue together.
- **Do** keep controls capsule-shaped and at least 44px for primary actions.
- **Do** reserve the magenta foil button for the one action needed now.
- **Do** put hung sachets in a `.rack` and gate motion on `prefers-reduced-motion`.
- **Do** use `drop-shadow` filters for sachet depth.

### Don't:
- **Don't** use the condensed display voice for running text.
- **Don't** convey status by colour alone, or use magenta for decoration.
- **Don't** replace the neutral ground with a gradient or a billing table with badges.
- **Don't** add hard offset shadows, or box-shadows on notched shapes.
- **Don't** add small uppercase labels above headings; none exist in the build.
