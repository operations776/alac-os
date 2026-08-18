# ALAC OS Design Contract

Binding. A screen that violates section 10 does not ship.

## 1. What this product looks like and why

This is a decision cockpit read carefully for twenty focused minutes on a Friday, not a dense ATS operated all day. The content is **reasoning paragraphs**, not table rows, so the layout gives prose room to breathe and reserves density for the places where scanning genuinely helps: the account table, the score breakdown, the signal timeline.

The surface language rests on one split, and the whole contract follows from it:

> **All atmosphere lives in the background. Everything above it is plain.**

The background is a hacked terminal: an absolute void ground, a faint circuit grid drifting behind the layout, and a CRT scanline overlay so every screen is read through the same glass. That is where the product gets its character, and it costs the reader nothing because nothing lives there.

Above it, the content is deliberately quiet. Square panels with one hairline border. Grey text. Two accent colours doing semantic work and no decorative colour at all. No cut corners, no glow, no corner brackets, no emphasis variant on a panel, no effect on a glyph.

The reason is not restraint for its own sake. This screen is read for twenty focused minutes to make real decisions about real accounts, and every treatment on a word is a treatment the eye has to look past to get to the word. A panel that matters more than its neighbour says so with its heading and its position on the page, which is a thing you can read, rather than with a ring, which is a thing you have to learn.

The feeling to aim for is a quiet terminal on a live machine. When a screen feels busy, the fix is removing a panel, not dimming one.

## 2. Colour

Dark only, by mandate. There is no light theme and none will be added: the palette is built on a void ground and a grid that only reads against it, and neither survives a white page.

Tokens are defined once in `src/app/globals.css` on `:root`. Never give a colour its only definition inside a media query.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0a0a0f` | Page ground, the void |
| `--surface` | `#12121a` | Panel faces |
| `--surface-2` | `#1c1c2e` | Recessed wells, table stripes |
| `--line` | `#2a2a3a` | Panel borders, dividers |
| `--line-strong` | `#3d3d55` | Control borders |
| `--ink` | `#e0e0e0` | Primary text |
| `--ink-2` | `#b8b8cc` | Secondary text |
| `--ink-3` | `#8f8fa8` | Captions, metadata |
| `--brand` | `#00ff88` | Actions, selection, focus, healthy |
| `--brand-soft` | `#0a2a1c` | Selected row, active nav |
| `--readout` | `#00d4ff` | Every number the engine computed |
| `--good` | `#00ff88` | Promote, positive signal |
| `--warn` | `#ffb020` | Risk, needs attention |
| `--bad` | `#ff5c85` | Demote, negative signal, failure |

**Green is a verb.** If it is not clickable, selected, focused, or healthy, it is not green.

**Cyan is a noun, and only one noun: a measured quantity.** Scores, counts, totals, durations, dates the engine recorded. If a human or a model wrote it, it is ink.

Those two rules are the entire colour system on text. Everything else on the page is grey, which is what makes the two accents mean anything: colour here is a signal, never a finish. There is no third accent, and adding one is a change to this document first.

**Status is never colour alone.** Every status carries colour plus an icon plus a word. A promotion is a green check and the word "Promote", so it survives colourblindness, greyscale printing, and a glance. On the score list the band drives brightness rather than hue, and the band is always in the title attribute.

`--ink-3` and `--bad` deliberately depart from the source palette: the literal values landed at 4.0:1 and 4.7:1 on `--surface-2`, and legibility outranks fidelity to a swatch. Every token above clears WCAG AA against `--bg`, `--surface`, and `--surface-2`.

## 3. Type

Everything is monospace. This is a terminal, and a proportional face in it reads as a document that wandered into the wrong window.

| Face | Loaded as | Job |
| --- | --- | --- |
| Orbitron | `--font-display`, class `.display` | Headings only. Uppercase, tracked 0.06em |
| JetBrains Mono | `--font-body` | Body, UI, tables, and every readout |
| Share Tech Mono | `--font-label`, class `.placard` | HUD labels, column heads, badges, buttons. Uppercase, tracked 0.2em |

Tabular numerals wherever digits align: `.readout` and `.tabular` both carry `font-variant-numeric: tabular-nums`.

| Role | Size | Notes |
| --- | --- | --- |
| Page title | 26px, 32px at sm | `.display` |
| Panel heading | 13px | `.display` |
| Body, reasoning prose | 13px to 14px, 1.65 to 1.75 line height | |
| UI default, table cells | 12px to 13px | |
| Caption, metadata | 11px to 11.5px | |
| Placard, column header, badge | 9.5px to 10.5px | `.placard` |

Uppercase is the chrome voice: headings, eyebrows, column headers, badges, buttons, nav. **Data is never uppercased.** A company name, a person's name, a signal headline, and reasoning prose all render in their natural case, because they are content, not chrome.

Reasoning prose gets `.prose-measure`, capped at 62ch. Monospace runs wider per character, so 62ch lands on roughly the same physical line length the old 68ch did.

## 4. Shape and space

**Every corner is square.** There is no radius token and no chamfer token. A rounded corner and a cut corner are both a decorative choice about a container, and containers here are not decorated.

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 48. Nothing between. Layout uses flex or grid with `gap`, never per-element margins that collapse or double.

## 5. Depth

Two treatments, and there is no third:

1. **Panel** (`.panel`): `--surface` with a 1px `--line` border. The default and only container. It has no emphasis variant: `<Card>` takes no `live` prop, there are no corner brackets, and a panel never carries an accent border.
2. **Well** (`.well`): `--surface-2` with the same border, one step below the panel face. Arithmetic, traces, evidence.

**There is no shadow and no glow anywhere in the product.** Not on panels, not on controls, not on text, not on focus rings. Depth is carried by three background values and one border colour, which is enough on a void ground and stays enough as the app grows.

If a future change wants a shadow, the first question is what it is compensating for. Usually it is a hierarchy problem that a heading or an ordering would fix better.

## 6. Components

Primitives live in `src/components/ui/primitives.tsx` and are hand rolled. No component library.

Control recipes (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.field`, `.link`, `.panel`, `.well`) live in `globals.css`, not as Tailwind strings in pages. Before writing a new button or input string, check whether the recipe already exists. It does.

**Buttons.** A bordered outline at rest, filling and inverting on hover. Primary is the single action on a view. Danger always confirms. Minimum height 40px, which clears WCAG 2.5.8 comfortably. Controls are the one place green is allowed on a resting element, because a control is interactive by definition.

**Fields.** Recessed, monospace, typed in accent green with a matching caret, because what you type is interactive content. Selects keep the native popup: a hand rolled listbox would cost keyboard and screen reader behaviour the native control gives for free.

**Tables.** 12px to 13px, sticky-free, right-aligned numbers in `.readout`. Row hover raises the background one step. Past 200 rows, virtualize or paginate server side.

**Score display.** The number is large, cyan, and tabular. Its size is its emphasis, and nothing is added around or on top of it. The breakdown is a table of term, input, weight, points, plus the accumulation ladder. Never a donut chart, never a gradient bar. The arithmetic is the point.

**Evidence.** Any AI claim renders with its cited signals directly beneath it, each showing headline, date, and source. A claim with no visible evidence is a bug, not a style choice.

**Links.** `.link` is undecorated at rest and is the brightest text in its row, which is the resting affordance. Hover shifts it to accent green and adds an underline: two channels, and neither is an effect on the glyph.

**Data graphics** (`TickScale`, `GaugeRow`, `ScoreLadder`, the run bar) keep their colour, because there the colour is the data. They are still flat: a filled travel, a hard 2px index mark, no gradient and no glow.

## 7. Icons

Lucide only, 16px, stroke 1.5, `currentColor`. 20px is permitted in empty states. **No emoji anywhere in the UI.**

## 8. Empty, loading, error

Every list has all three, designed, never a bare spinner or a blank panel.

- **Empty** states are drawn as a stalled terminal: a `>` prompt and a status line, static. They say what would be here, why it is not, and the one action that fills it.
- **Loading** uses skeletons shaped like the content that is coming, not a centered spinner.
- **Errors** say what failed and what to do next. No apologies, no raw stack traces.
- **Disabled by configuration** is its own state and must be honest: with no model key, the reasoning panel says the reasoning pass is disabled and how to enable it. It never renders invented prose.

## 9. Motion and the text rule

**Nothing is ever applied to a glyph.** No chromatic aberration, no text-shadow glow, no blinking cursor, no animation passing across a block of text. Type stays flat, still, and legible, because reading is the job and a fringed or moving letterform has to be read twice.

The atmosphere is carried entirely by the background: the void ground, the drifting circuit grid, and the CRT scanline overlay. Everything expressive happens behind the content, never on it. That is the rule that lets the theme cost the reader nothing.

Transitions are sharp and mechanical: 100ms to 120ms on `steps(3)` or `steps(4)`, never a smooth cubic bezier. Digital systems snap, they do not ease.

**One animation exists in the entire product**: `graticule-drift`, which creeps the background circuit grid by one cell over 40 seconds. It sits behind every panel, so it only ever shows in the gutters between them and never passes under text. Adding a second animation means deleting this one or justifying it against this section.

`prefers-reduced-motion` stops the drift where it stands.

## 10. The contract

A screen ships only if all of these hold.

1. **Atmosphere lives only in the background.** The ground, the grid, and the scanlines carry the theme. Nothing above them is decorated.
2. **No effect is ever applied to text.** No glow, no shadow, no aberration, no animation over a block of copy. Colour and weight are the only things type carries.
3. **No shadow and no glow anywhere**, on any element, in any state.
4. Every corner is square. No radius, no chamfer.
5. Green appears only on interactive, selected, focused, or healthy elements.
6. Cyan appears only on a number the engine computed. There is no third accent.
7. Every status has colour, icon, and word.
8. Chrome is uppercase. Data is never uppercased.
9. Numbers are tabular and right aligned in tables.
10. Reasoning prose is capped at 62ch.
11. Every AI claim shows its cited evidence with dates and source.
12. Empty, loading, and error states exist and are designed.
13. Icons are Lucide 16px stroke 1.5. No emoji.
14. Nothing important lives behind hover. Hover reveals shortcuts, never primary information.
15. Keyboard focus is always visible: a 2px accent outline at 2px offset, from the one rule in `globals.css`. Nothing may clip it.
16. No new button or field string in a page file. Use the recipe.
17. No em dashes in any UI copy.
18. Checked at 1440x900 and at 390x844 before the change is pushed.
