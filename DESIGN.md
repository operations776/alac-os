# ALAC OS Design Contract

The UI contract. `src/app/globals.css` is the implementation of section 2; this file is the argument for it. If the two disagree, one of them is a bug.

## 1. What this product looks like and why

**Material Design 3, seeded from #6750A4.** Friendly, soft, tonal, and personal. Depth is carried by surface tone rather than by lines: a panel is a different tone from the ground, not a box drawn on it. Shape does the rest, and it is the part you notice first, every button is a pill and every container is generously rounded.

This replaced a dark terminal theme built on a void ground, a circuit grid, CRT scanlines, monospace type, square corners, and two accents doing semantic work (green for interactive, cyan for computed). None of that survives. The reason is not fashion: the old theme made an operator tool that is read for hours at a time feel like an instrument being monitored rather than a workspace being used, and its 9 to 11px uppercase label type was the smallest, hardest working text in the product.

What did not change is the claim underneath: **the score is deterministic and every number opens its own arithmetic.** The theme is softer. The audit trail is not.

One deliberate loss is recorded here so it is not rediscovered as a bug. The old palette gave scores their own colour channel, cyan meant "the engine computed this" and green meant "you can touch this". Material 3 gives both jobs to primary, so that distinction is gone from colour. It is carried by shape and face instead: interactive things are pills, computed things are tabular and sit in a readout position. If a future change needs the distinction back, tertiary is unused for data and is the place to put it.

## 2. Colour

Light only. There is no dark theme, and the tonal surface system is what makes that legible rather than glaring: the ground is a warm off-white, never pure white.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Ground | `--md-surface` | `#FFFBFE` | Page background. Never `#FFFFFF`. |
| Panel | `--md-surface-container` | `#F3EDF7` | Cards, the nav rail, every panel face. |
| Well | `--md-surface-container-low` | `#E7E0EC` | Recessed: arithmetic, evidence, table heads, inputs. |
| Well, raised | `--md-surface-container-high` | `#ECE6F0` | Meter tracks inside a well. |
| Text | `--md-on-surface` | `#1C1B1F` | Body and headings. Never pure black. |
| Text, secondary | `--md-on-surface-variant` | `#49454F` | Sub lines, labels, table cells. |
| Text, muted | `--md-on-surface-muted` | `#625B71` | Metadata, hints, absent values. |
| Primary | `--md-primary` | `#6750A4` | CTAs, focus, selection, and every computed number. |
| Primary container | `--md-primary-container` | `#EADDFF` | High score pills, the next best action. |
| Secondary container | `--md-secondary-container` | `#E8DEF8` | Chips, the selected nav item, tonal buttons. |
| Tertiary | `--md-tertiary` | `#7D5260` | Accent. Currently only atmosphere. |
| Outline | `--md-outline` | `#79747E` | Input underline. |
| Outline variant | `--md-outline-variant` | `#CAC4D0` | Table rules, the one kind of divider allowed. |
| Error | `--md-error` | `#B3261E` | Penalties, failures, destructive actions. |
| Success | `--md-success` | `#146C2E` | Open roles, healthy runs. |
| Warning | `--md-warning` | `#7A5900` | Suppressed accounts, partial runs, stated limits. |

Every status colour has a matching `-container` tone, and status is always drawn as text-on-container, never as a coloured outline.

Success and warning are not in the Material 3 spec, which ships error only. They are built to match it: a 40 tone text colour over a 90 tone container.

**Measured contrast**, every text role against all four surface tones:

| Role | Worst case | Against |
| --- | --- | --- |
| `--md-on-surface` | 13.27 | the well |
| `--md-on-surface-variant` | 7.24 | the well |
| `--md-on-surface-muted` | 5.00 | the well |
| `--md-primary` as text | 4.99 | the well |
| status on its container | 5.00 | warning |

The floor is 4.99, so every text role clears AA at 4.5 on every surface it is used on. `--md-on-surface-muted` is `#625B71` rather than the outline grey a Material palette would reach for first, because outline grey lands near 4.0 on the well and that is the tone the smallest text sits on.

**Borders are not how containers separate.** A tonal step is. The only lines in the product are table rules, the input underline, and one divider inside the review sidebar.

Two of those deliberately sit below the 3:1 non-text threshold, and this is correct rather than an oversight. `--md-outline-variant` as a table rule measures 1.48 on a panel: WCAG 1.4.11 covers UI components and meaningful graphics, and a row divider is neither, the rows are already separated by layout and no information depends on seeing the line. The input underline is the case that does have to pass, because it is the visible boundary of a control, and it uses `--md-outline` at 3.53. **Do not darken the table rules to chase a number that does not apply to them.**

## 3. Type

**Roboto, one family, every job.** Material 3 separates a display heading from a caption with weight and size, not with a second family. The previous theme carried three faces (Orbitron display, JetBrains Mono body, Share Tech Mono labels) and all three are gone.

| Recipe | Weight | Use |
| --- | --- | --- |
| `.display` | 500, tracking −0.01em | Every heading. Sentence case. |
| `.placard` | 500, tracking 0.01em | Eyebrows, column heads, chips, buttons. Sentence case. |
| `.readout` | 500, tabular figures | Any number the engine computed. |
| body | 400 | Everything else. |

Base size is 14px, not the spec's 16px: this is a dense tool and the scale is applied through the recipes at a working size. **The floor is 11px** and it is only for a chip. Nothing in the product is 9 or 10px any more.

Nothing is uppercase. `.placard` used to be uppercase at 0.2em tracking and that single choice was the strongest remaining signal of the terminal theme.

## 4. Shape and space

Radius is architectural here, not decoration.

| Token | Value | Use |
| --- | --- | --- |
| `--md-radius-xs` | 8px | Focus ring rounding. |
| `--md-radius-sm` | 12px | Input top corners, list rows. |
| `--md-radius-md` | 16px | Wells, tonal callouts. |
| `--md-radius-lg` | 24px | Every panel. |
| `--md-radius-xl` | 28px | The nav rail's outer edge. |
| full | 9999px | Every button, chip, badge, and meter. |

**Density is operator density, not marketing density.** The spec's 24 to 32px card padding and 48 to 96px sections are tuned for a landing page. Tables here stay at roughly 40px rows and panels at 16 to 20px padding, so a screenful of accounts is still a screenful. The dashboard, sign in, and empty states get the roomier spacing, because they have room.

## 5. Depth

Elevation is a soft shadow confirming a tonal step, never a dramatic drop shadow.

- `--md-elev-1` panels at rest.
- `--md-elev-2` hover on an interactive panel, filled buttons on hover, the sign in card.
- `--md-elev-3` reserved. Nothing uses it yet.

`.panel` has the resting shadow. **Hover elevation is opt in, via `.panel-interactive`.** A panel that lifts under the cursor is promising a click, so a static one must not.

Atmosphere is two soft radial washes on `.surface-wash` plus `.blob` shapes: heavy blur, low opacity, positioned partly off canvas, always `aria-hidden`. They sit behind opaque panels, so they only ever show in the gutters. Sign in gets the strongest treatment because it is the one screen with nothing to read.

## 6. Components

Recipes live in `globals.css`. A page file never invents a control.

- `.btn` with `.btn-primary` (filled), `.btn-secondary` (tonal), `.btn-ghost` (text), `.btn-danger`. Pill, 40px minimum, `scale(0.95)` on press.
- `.field` is the Material 3 filled text field: rounded top corners, square bottom, 2px underline that turns primary on focus, 48px minimum.
- `.panel`, `.well`, `.chip`, `.link`.
- **State layers, not colour swaps.** Hover on a filled surface is the base colour at 90%, active at 80%. Hover on a transparent surface is primary at 8 to 10%. A hover that changes hue is wrong.
- Transitions are 300ms on `cubic-bezier(0.2, 0, 0, 1)`, 200ms for a press.

The `Meter` primitive replaced a ruled tick scale. It is a rounded track with a rounded primary fill, no graduations and no index mark. It is presentational and never the only carrier of a value, the number is always printed beside it, which is what makes dropping the graduations safe.

## 7. Icons

Lucide only, 16px, stroke 1.5. No emoji, anywhere, ever.

## 8. Empty, loading, error

Every one of them exists and is designed. An empty state says what would be here, why it is not, and what fills it. An error is a tonal container in the error or warning role, never a bare red line. A stated limitation is `NoticeLine` and is shown, not hidden.

## 9. Motion

Motion is feedback, and it is allowed on content now: the previous theme banned it over text because the ground itself was moving, and the ground no longer moves.

What animates: background colour and state layers, shadow elevation, press scale, meter width, opacity. What does not: border radius, layout, colour hue.

`prefers-reduced-motion: reduce` cuts durations to nothing and removes every transform. Every scale in the product is decorative, so this costs no information.

## 10. The contract

A screen ships only if all of these hold.

1. **Depth is tonal.** A container separates from its ground by tone, not by a border. The only lines are table rules and the input underline.
2. **No pure white and no pure black.** The ground is `#FFFBFE` and text is `#1C1B1F`.
3. **Every button, chip, badge, and meter is a pill.** There is no rectangular button variant.
4. **Panels are 24px radius.** Nothing important is square.
5. **State layers, never hue swaps.** Hover and press change opacity over the base colour.
6. **Hover elevation is opt in.** Only `.panel-interactive` lifts, and only when it is genuinely clickable.
7. Every status has colour, icon, and word.
8. Nothing is uppercase, and no text is smaller than 11px.
9. Numbers are tabular and right aligned in tables.
10. Reasoning prose is capped at 68ch.
11. Every AI claim shows its cited evidence with dates and source.
12. Empty, loading, and error states exist and are designed.
13. Icons are Lucide 16px stroke 1.5. No emoji.
14. Nothing important lives behind hover. Hover reveals shortcuts, never primary information.
15. Keyboard focus is always visible: a 2px primary outline at 2px offset, from the one rule in `globals.css`. Nothing may clip it.
16. No new button or field string in a page file. Use the recipe.
17. There is one colour token set, `--md-*`. No second palette and no appearance named aliases.
18. No em dashes in any UI copy.
19. Checked at 1440x900 and at 390x844 before the change is pushed.
