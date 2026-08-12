# ALAC OS Design Contract

Binding. A screen that violates section 9 does not ship.

## 1. What this product looks like and why

This is a decision cockpit read carefully for twenty focused minutes on a Friday, not a dense ATS operated all day. The content is **reasoning paragraphs**, not table rows, so the layout gives prose room to breathe and reserves density for the places where scanning genuinely helps: the account table, the score breakdown, the signal timeline.

The feeling to aim for is a quiet analyst's briefing. Calm, evidence forward, nothing shouting. When a screen feels busy, the fix is removing a panel, not shrinking one.

## 2. Color

Anchored on the ALAC brand navy `#14137b`. Navy is the product's one strong voice: it marks what is actionable and what is currently selected, nothing else.

Tokens are defined once in `src/app/globals.css` on `:root`, redefined for dark under both `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`. Never give a color its only definition inside a media query.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#FBFAFC` | `#0F0F1A` | Page ground |
| `--surface` | `#FFFFFF` | `#171727` | Cards, panels |
| `--surface-2` | `#F6F5FA` | `#1E1E30` | Nested wells, table stripes |
| `--line` | `#E7E5F0` | `#2C2C42` | Borders, dividers |
| `--ink` | `#16162B` | `#EDECF5` | Primary text |
| `--ink-2` | `#5C5872` | `#A19DB5` | Secondary text |
| `--ink-3` | `#8B87A0` | `#726E88` | Captions, metadata |
| `--brand` | `#14137b` | `#9E9CF0` | Actions, selection, focus |
| `--brand-soft` | `#EEEEF9` | `#22213F` | Selected row, active nav |
| `--good` | `#12703C` | `#5FD68A` | Promote, positive signal, healthy |
| `--warn` | `#8A5200` | `#E3B265` | Risk, needs attention |
| `--bad` | `#A82020` | `#F08A8A` | Demote, negative signal, failure |

**Navy is a verb.** If it is not clickable, selected, or focused, it is not navy. A score of 91 is ink, not brand. A heading is ink, not brand.

**Status is never color alone.** Every status carries color plus an icon plus a word. A promotion is a green up-arrow and the word "Promote", so it survives colorblindness, greyscale printing, and a glance.

Semantic colors are reserved for meaning. They are never decoration and never a chart series.

## 3. Type

System sans stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif`. Tabular numerals wherever digits align: `font-variant-numeric: tabular-nums` on scores, money, counts, and every table column of numbers.

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| Page title | 24px | 700 | 1.2 |
| Section heading | 16px | 700 | 1.35 |
| Body, reasoning prose | 15px | 400 | 1.6 |
| UI default, labels, table cells | 13.5px | 400/600 | 1.5 |
| Caption, metadata, source lines | 12px | 400 | 1.45 |
| Eyebrow, column header | 10.5px | 700 | 1.4, uppercase, 0.08em tracking |

Body text stays near 65 characters. Reasoning paragraphs get `max-width: 68ch` and are never full bleed. Headings carry `text-wrap: balance`.

Uppercase appears only in eyebrows and table column headers. Never in buttons, headings, or body.

## 4. Space and radius

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 48. Nothing between.

Radius: 6px controls, 10px cards, 999px pills. No other values, and never an arbitrary `rounded-[7px]`.

Layout uses flex or grid with `gap`. Never per-element margins that collapse or double.

## 5. Depth

Three treatments, no more:

1. **Flat**: `1px solid var(--line)` on `--surface`. The default for every card and panel.
2. **Raised**: the same border plus `0 1px 2px rgb(20 19 123 / 0.05), 0 6px 20px rgb(20 19 123 / 0.05)`. Dialogs, drawers, popovers only.
3. **Inset**: `--surface-2` with a top inner border. Code blocks, score breakdown wells, prompt traces.

Shadows are navy tinted, never neutral grey, and never stock Tailwind shadow utilities.

## 6. Components

Primitives live in `src/components/ui/` and are hand rolled: Button, Input, Select, Badge, Table, Dialog, Drawer, Toast, EmptyState, Skeleton. No component library.

**Buttons.** Primary is navy fill, white text, used once per view for the main action. Secondary is bordered on surface. Ghost is text plus hover fill, for tertiary actions. Destructive borrows `--bad` and always confirms.

**Tables.** 13.5px, striped on `--surface-2`, sticky header, right-aligned numbers with tabular numerals. Row hover raises the background one step. Past 200 rows, virtualize or paginate server side.

**Score display.** The number is large, ink colored, tabular. The breakdown is a table of term, input, weight, points. Never a donut chart, never a gradient bar. The arithmetic is the point.

**Evidence.** Any AI claim renders with its cited signals directly beneath it, each showing headline, date, and source. A claim with no visible evidence is a bug, not a style choice.

## 7. Icons

Lucide only, 16px, stroke 1.5, `currentColor`. 20px is permitted in empty states. **No emoji anywhere in the UI.**

## 8. Empty, loading, error

Every list has all three, designed, never a bare spinner or a blank panel.

- **Empty** states say what would be here, why it is not, and the one action that fills it.
- **Loading** uses skeletons shaped like the content that is coming, not a centered spinner.
- **Errors** say what failed and what to do next. No apologies, no raw stack traces.
- **Disabled by configuration** is its own state and must be honest: with no model key, the reasoning panel says the reasoning pass is disabled and how to enable it. It never renders invented prose.

## 9. The contract

A screen ships only if all of these hold.

1. Navy appears only on interactive, selected, or focused elements.
2. Every status has color, icon, and word.
3. Radius is 6, 10, or 999. Spacing is on the scale.
4. Depth is flat, raised, or inset. Shadows are navy tinted.
5. Numbers are tabular and right aligned in tables.
6. Reasoning prose is capped near 68ch.
7. Every AI claim shows its cited evidence with dates and source.
8. Empty, loading, and error states exist and are designed.
9. Icons are Lucide 16px stroke 1.5. No emoji.
10. Nothing important lives behind hover. Hover reveals shortcuts, never primary information.
11. Keyboard focus is always visible, using a navy ring at 2px offset 2px.
12. No em dashes in any UI copy.
13. Both themes are checked at 1440x900 before the change is pushed.
