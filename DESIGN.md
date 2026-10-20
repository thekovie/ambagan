---
name: ambagan
description: Split it, settle it. Monthly shares as pastel die-cut stickers in a sticker book.
colors:
  ink: "oklch(0.27 0.05 335)"
  ground-light: "oklch(0.976 0.012 35)"
  card-light: "oklch(0.996 0.005 35)"
  secondary-light: "oklch(0.945 0.022 35)"
  muted-light: "oklch(0.956 0.016 35)"
  muted-foreground-light: "oklch(0.46 0.04 335)"
  border-light: "oklch(0.89 0.02 35)"
  input-light: "oklch(0.62 0.045 335)"
  ring-light: "oklch(0.5 0.17 335)"
  destructive-light: "oklch(0.5 0.2 25)"
  ground-dark: "oklch(0.2 0.03 335)"
  card-dark: "oklch(0.255 0.036 335)"
  text-dark: "oklch(0.96 0.015 35)"
  muted-foreground-dark: "oklch(0.78 0.03 335)"
  border-dark: "oklch(0.36 0.04 335)"
  input-dark: "oklch(0.55 0.05 335)"
  ring-dark: "oklch(0.82 0.11 340)"
  destructive-dark: "oklch(0.74 0.17 22)"
  sticker-sky: "oklch(0.87 0.065 240)"
  sticker-mint: "oklch(0.91 0.085 160)"
  sticker-butter: "oklch(0.94 0.1 95)"
  sticker-peach: "oklch(0.88 0.085 50)"
  sticker-rose: "oklch(0.87 0.085 5)"
  sticker-lilac: "oklch(0.86 0.075 300)"
  sticker-edge: "oklch(0.995 0.004 35)"
  candy: "oklch(0.55 0.21 8)"
  on-candy: "oklch(0.99 0.005 8)"
typography:
  display:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 12vw, 4.5rem)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.2rem + 3.5vw, 2.75rem)"
    fontWeight: 650
    lineHeight: 1.1
  title:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
  reference:
    fontFamily: "ui-monospace, SF Mono, Cascadia Mono, Menlo, monospace"
    fontSize: "0.8rem"
    letterSpacing: "-0.025em"
rounded:
  base: "1rem"
  card: "1.5rem"
  sticker: "2rem"
  pill: "999px"
spacing:
  touch: "44px"
  dock-item: "48px"
  top-bar: "64px"
components:
  button-default:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground-light}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  button-candy:
    backgroundColor: "{colors.candy}"
    textColor: "{colors.on-candy}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  sticker:
    backgroundColor: "{colors.sticker-sky}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sticker}"
  sheet:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  dock:
    backgroundColor: "{colors.card-light}"
    textColor: "{colors.muted-foreground-light}"
    rounded: "{rounded.pill}"
    height: "60px"
    padding: "6px"
  empty-state:
    backgroundColor: "{colors.ground-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sticker}"
    padding: "40px 24px"
---

# Design System: ambagan

## Overview

**Creative North Star: "The Sticker Book"**

Every month's share is a pastel sticker in a friend's sticker book. A settled one has its corner peeled back with a small sparkle; one that still needs doing sits whole and bright. The ground is a soft marshmallow cream in light and a warm plum-cocoa in dark, so that pastel stickers with dark plum ink carry the colour and the meaning. The cuteness is a hint, not a costume: no mascot, no confetti, one round friendly typeface, soft tinted shadows, and a single peel motif.

Density is low and thumb-sized. There is no sidebar anywhere: a small floating dock at the bottom of every screen is the only navigation, and a slim top bar holds the wordmark and an account bubble. Depth is gentle: stickers and sheets lift off the ground with plum-tinted shadows.

**Key Characteristics:**
- Pastel sticker fields with dark plum ink on a warm tinted ground; the pastels are theme-independent.
- Status carried by word, icon, edge shape and hue together, never colour alone.
- Capsule controls; cards 1.5rem; stickers 2rem with a white die-cut border.
- One soft rounded family (Nunito), medium to semibold, peso amounts included.
- Candy (a deep raspberry) is reserved for the one action needed right now.

## Colors

Six pastels over a plum ink; every neutral is tinted toward hue 335 (plum) or 35 (cream).

### Primary
- **Plum Ink** (`ink`): text in light theme, the default button fill, and the text on every sticker pastel in both themes.
- **Marshmallow** (`ground-light`): light ground; the dark ground is **Plum Cocoa** (`ground-dark`).

### Secondary (the stickers)
- **Sky** (`sticker-sky`): UNPAID.
- **Butter** (`sticker-butter`): UNDER_VERIFICATION, and the header of each payment in the admin's verify queue.
- **Mint** (`sticker-mint`): PAID.
- **Peach** (`sticker-peach`) with a **Rose** (`sticker-rose`) corner tab: OVERDUE.
- **Lilac** (`sticker-lilac`): the current item in the dock, empty-state icon chips, text selection.
- Peach, mint, sky, lilac, rose and butter also colour member avatars (picked from the name) and the admin's email-status tiles.
- **Candy** (`candy`, white text `on-candy`, 5.3:1): the single action that needs doing now: Submit payment, Approve, the Verify count badge.

### Neutral
- Light: card (`card-light`), secondary and muted tints, muted text (`muted-foreground-light`), hairline border (`border-light`), field border (`input-light`, 3.5:1 against the ground), focus ring (`ring-light`), error (`destructive-light`).
- Dark: card (`card-dark`), text (`text-dark`), muted text, border, field border (`input-dark`), pale-rose focus ring (`ring-dark`), error (`destructive-dark`).
- CANCELLED uses the ground with muted text and a dashed outline, no pastel.

### Named Rules
**The Ink-On-Pastel Rule.** Text on a sticker pastel is always plum ink (9.8:1 to 12.9:1), in both themes. Never theme-flip text on a pastel.

**The One Candy Rule.** Candy marks the single action needed now. Do not use it for decoration or for secondary actions.

**The Never-Colour-Alone Rule.** A status is always colour plus word plus icon plus edge shape.

## Typography

**Display Font:** Nunito variable, weight 650.
**Body Font:** Nunito variable, 400 to 700.
**Mono Font:** system monospace stack, used only for statement references.

**Character:** One round, friendly family at medium to semibold weight (the earlier ultra-condensed heavy face was too strong). Digits are equal-width, so peso columns line up; tabular numerals are on globally.

### Hierarchy
- **Display** (650, `clamp(2.75rem, 12vw, 4.5rem)`, 1.1): the peso amount on the current sticker; compact stickers use 2.25rem.
- **Headline** (`text-display`, 650, `clamp(2rem, 1.2rem + 3.5vw, 2.75rem)`): page titles.
- **Title** (`text-title`, 650, 1.5rem): section and empty-state headings. These two utilities are the whole heading scale.
- **Body** (400, 1rem): descriptions, meta lines (max 38ch in empty states).
- **Label** (700, 0.875rem): pills, buttons, dock items. Sentence case.
- **Reference** (mono, 0.8rem): statement references such as SPOT-202610-A1B2C3.

### Named Rules
**The Gentle Weight Rule.** Nothing is heavier than 700 and headings sit at 650. Hierarchy comes from size and spacing, not from shouting.

## Layout

Mobile first, one centred column on every screen size (`max-w-3xl` for members, `max-w-4xl` for admin). A slim 64px top bar holds the wordmark (left) and the account bubble (right), which opens a small menu with the name, the dark-theme switch and Sign out. Navigation is a floating dock, fixed bottom-centre and safe-area aware: member Home, Statements, History, Me; admin Overview, Verify (with a count badge), Statements, and a More bubble that opens a sheet of Members, Plans, Emails, Settings. The current item grows its label. On touch screens the dock steps aside while a text field is focused so it never covers the keyboard or a submit button. Content leaves 7.5rem at the bottom for the dock, and the page keeps scroll padding so focused fields are never hidden behind the top bar or the dock. Touch targets are 44px or larger.

## Elevation & Depth

Soft and tinted: shadows are plum, never black.

### Shadow Vocabulary
- **Sheet** (`0 1px 2px` at 6% plus `0 10px 22px -10px` at 20%): cards.
- **Dock** (`0 2px 4px` at 8% plus `0 18px 34px -12px` at 30%): the floating dock and popups.
- **Sticker lift** (`filter: drop-shadow(0 1px 1px)` plus `drop-shadow(0 14px 14px)`, plum tint at 14% and 20%): every sticker. A filter, so the shadow follows the peeled corner.
- **Candy glow** (`0 8px 16px -6px` raspberry at 55%, reduced on press): the candy action only.

### Named Rules
**The Follow-the-Silhouette Rule.** Shadows on stickers use `filter: drop-shadow`, never `box-shadow`, so the peeled corner casts correctly.

## Shapes

Fully round capsules for controls, pills, the dock and avatars (999px). Cards 1.5rem; stickers 2rem with a 5px white die-cut border; base radius 1rem. The peel is a clip-path on the sticker face with a folded-back flap on the same diagonal, driven by one registered custom property. Edge forms by status: UNPAID whole; UNDER_VERIFICATION half peeled (1.75rem); PAID peeled (3rem) with a small sparkle; OVERDUE whole with a rose corner tab and one gentle wobble on arrival; CANCELLED a dashed empty slot with a struck-through amount. Odd and even stickers in a list tilt by about half a degree (none in print).

## Components

### Buttons
Capsule, 44px default height (`xs` 32, `sm` 36, `lg` 56), 700 weight, 200ms ease-out-expo transitions; press nudges down and scales to 0.98. Focus: a 3px ring.
- **Default:** ink fill, ground text (inverts in dark).
- **Candy:** raspberry fill, white text, glow shadow. Pay now or approve only.
- **On sticker:** ink fill with sticker-edge text; the action on any coloured sticker.
- **Outline / Secondary / Ghost / Link / Destructive:** quiet variants for everything else.

### Status Pill
Capsule with the status word and a trailing round chip holding a 3px-stroke icon (circle-dashed, hourglass, check, alert-triangle, ban). Fill follows the status pastel; on its own sticker the pill inverts to white so it never vanishes into the field.

### Sticker (signature)
Pastel face with a white die-cut border: subscription and period, status pill, the peso amount, due date and reference, then the action row (padded clear of the peeled corner). On approval (`data-just-paid`) the corner peels over 0.9s and the sparkle scales in once. Reduced motion shows the final state with no movement.

### Sheet
An ordinary soft card (`card` fill, hairline border, sheet shadow, 1.5rem radius) for details, forms, history entries and admin sections. In print it loses its shadow.

### Dock and Account Menu
The dock is a floating capsule of 48px items. The active item fills lilac and shows its label (the label is always in the accessibility tree); the Verify item carries a candy count badge (capped at "9+") on the icon's corner. More and the account bubble open Base UI popups (Escape and outside press close them, focus returns to the trigger).

### Empty State
An empty sticker slot: 2px dashed border at the sticker radius, a lilac round icon chip, a title, a muted 38ch description, and an optional action.

### Wordmark
Lowercase "ambagan" in the display face with a small rose sticker glyph whose corner is peeled.

## Do's and Don'ts

### Do:
- **Do** use plum ink on every sticker pastel, in both themes.
- **Do** show status as word, icon, edge shape and hue together.
- **Do** keep controls capsule-shaped and at least 44px.
- **Do** reserve candy for the one action needed now.
- **Do** gate every animation on `prefers-reduced-motion: no-preference`.
- **Do** use `drop-shadow` filters for sticker depth.

### Don't:
- **Don't** add a sidebar, a mascot or confetti.
- **Don't** set anything heavier than weight 700 or use the old condensed look.
- **Don't** convey status by colour alone, or use candy for decoration.
- **Don't** add hard offset shadows, or box-shadows on a peeled sticker.
- **Don't** add small uppercase labels above headings.
