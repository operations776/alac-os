# ALAC OS Design Contract

The UI contract. `src/app/globals.css` is the implementation of section 2; this file is the argument for it. If the two disagree, one of them is a bug.

## 1. What this product looks like and why

**The ALAC HR Solutions brand, taken from alachrsolutions.com rather than invented.** The navy scale, the periwinkle accent, the red, Barlow and DM Sans, the tracked uppercase mono label, and the square corners are all the marketing site's own values, read out of its stylesheet. This is an internal tool wearing the company's identity, so when the site and this app disagree, **the site is right and this app is wrong.**

The ground is deep navy, near black. Depth comes from a navy scale rather than from grey, so a panel is a lighter navy than the ground and never a grey box on a blue page. On a ground this dark a drop shadow does almost nothing, so separation is a lighter surface plus a hairline, not elevation.

Type carries the rest, in the split the site uses: **Barlow announces, DM Sans is read.** Anything that states something is Barlow; anything you actually read is DM Sans. The third face, the tracked uppercase mono under the site's hero, is the brand's signature and it is the system `Courier New, monospace` stack, exactly as the site declares it. It costs no font request.

This replaced a Material You theme (light, tonal purple, pill shaped, 24px radii), which in turn replaced a dark terminal theme. The reason for this one is different from the reason for the last: the previous swaps were about how the product felt, this is about whose product it is. It is ALAC's tool, so it wears ALAC's identity.

## 2. Colour

Dark only. There is no light theme, and the navy scale is what makes that legible rather than flat.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Ground | `--alac-ground` | `#05070a` | Page background, recessed wells, table heads, inputs. |
| Panel | `--alac-surface` | `#0b1020` | Cards, the nav rail. |
| Raised | `--alac-surface-2` | `#111a3a` | Row hover, chips, the selected nav row. |
| Line | `--alac-line` | `#1e2a55` | The hairline that separates a panel from the ground. |
| Line, strong | `--alac-line-strong` | `#2a3a98` | Outlined buttons, field hover. |
| Accent | `--alac-accent` | `#8ba8f5` | Every page title, links on hover, focus, computed numbers. |
| Accent, light | `--alac-accent-light` | `#c4d3ff` | Text on an accent fill, primary button hover. |
| Accent, soft | `--alac-accent-soft` | `#16203f` | Tonal fill behind an accent chip or callout. |
| Text | `--alac-text` | `#ffffff` | Body and panel headings. |
| Text, secondary | `--alac-text-2` | `#c7d0e4` | Sub lines, table cells. |
| Text, muted | `--alac-text-3` | `#93a1c0` | Metadata, hints, absent values. |
| Red, fill | `--alac-red` | `#b8292f` | The brand's own red. Only for things placed ON it: a filled danger button. |
| Red, text | `--alac-red-text` | `#e5686d` | Anything written IN red: failures, penalties, error copy. |
| Good | `--alac-good` | `#3ecf8e` | Healthy runs, decision makers, completed checks. |
| Warn | `--alac-warn` | `#e5a94a` | Held accounts, partial runs, stated limits. |

The corporate navy `#1a2563` is the **ground**, not an accent. Navy text on a navy page cannot carry, which is why the site sets its headings in periwinkle and so does this.

**The red is split, and this is the one place the brand could not be used as shipped.** `#b8292f` is built for white text on a light page. As text on this ground it measures 2.9:1 against its own soft fill, well under AA, so it stays for anything placed ON it and a lighter tint of the same hue carries anything written IN it. The filled danger button still uses the true brand red, with white on it at 6.2:1.

**Measured contrast.** Every text role against the worst of the three surfaces it appears on:

| Role | Worst case |
| --- | --- |
| `--alac-text` | 17.04 |
| `--alac-text-2` | 11.01 |
| `--alac-accent` as text | 7.32 |
| `--alac-text-3` | 6.57 |

Status text against its own soft fill: good 8.00, warn 7.70, red 5.50, accent 6.87. Text on filled controls: dark on the primary button 20.17, white on the danger button 6.18.

The floor across the whole palette is 5.50, so everything clears AA at 4.5 with room.

The hairlines sit below the 3:1 non-text threshold on purpose, and that is correct rather than an oversight. WCAG 1.4.11 covers UI components and meaningful graphics; a panel border here is neither, because the panel is already separated from the ground by being a lighter surface. The things that must pass do: the focus ring is 8.66 on the ground, and every filled control is above 13. **Do not lighten the hairlines to chase a number that does not apply to them.**

## 3. Type

| Recipe | Face | Use |
| --- | --- | --- |
| `.display-hero` | Barlow 600, periwinkle, loosened word spacing | Page titles only. One per screen. |
| `.display` | Barlow 600, white | Panel headings, section heads. |
| `.placard` | Mono, uppercase, 0.14em tracking | Eyebrows, column heads, chips, buttons, nav. |
| `.readout` | DM Sans, tabular figures | Any number. |
| body | DM Sans 400 | Everything else. |

Base size is 14px. **The floor is 10px and only for a `.placard`**, which is a two or three word label. Tracking that wide makes a sentence hard to read and makes a short label look deliberate, so `.placard` never carries prose.

The accent marks the top of a screen and nothing else: page titles are periwinkle, panel headings are white. If everything is accented, nothing is.

## 4. Shape and space

**The brand is square.** The site's buttons are rectangles and its largest radius is 6px, so there is no pill anywhere in this product and no radius above 10px.

| Token | Value | Use |
| --- | --- | --- |
| `--alac-radius-sm` | 3px | Buttons, chips, fields, list rows, meters. |
| `--alac-radius` | 6px | Panels, tonal callouts. |
| `--alac-radius-lg` | 10px | The one large readout card. |

Density is operator density. Tables stay at roughly 40px rows and panels at 16 to 20px padding, so a screenful of accounts is still a screenful. Sign in, the 404 and empty states get the roomier spacing, because they have room.

## 5. Depth

There is no elevation system. On a near black ground a shadow is invisible, so depth is:

1. A lighter surface than the ground.
2. One hairline in `--alac-line`.

`--alac-elev-1` and `--alac-elev-2` exist for the two things that genuinely float, and nothing else may use them. Hover on an interactive panel brightens its border rather than lifting it, and `.panel-interactive` is opt in: a panel that reacts to the cursor is promising a click, so a static one must not.

Atmosphere is `.surface-wash`, two soft navy radial gradients standing in for the photograph the marketing site puts behind its hero. It sits behind opaque panels, so it only shows in the gutters.

## 6. Components

Recipes live in `globals.css`. A page file never invents a control.

- `.btn` with `.btn-primary` (white fill, dark text, the site's "BOOK A CALL"), `.btn-secondary` (outlined), `.btn-ghost` (text), `.btn-danger`. All uppercase mono, square, 40px minimum.
- `.field` is recessed and square, with the accent arriving only on focus.
- `.panel`, `.well`, `.chip`, `.link`, `.row-hover`.
- Transitions are 200 to 240ms on `cubic-bezier(0.2, 0, 0, 1)`, set as Tailwind's default timing function so a bare `transition-colors` is already correct.

The `Meter` primitive is a square track with a flat accent fill. It is presentational and never the only carrier of a value: the number is always printed beside it.

The logo is one asset, `public/alac-logo.webp`, the navy-on-transparent version the brand uses on white. It is inverted to white in CSS rather than kept as a second file, so there is no chance of the two drifting apart. Use the `Logo` component, never the image directly.

## 7. Icons

Lucide only, 16px, stroke 1.5. No emoji, anywhere, ever.

## 8. Empty, loading, error

Every one of them exists and is designed. An empty state says what would be here, why it is not, and what fills it. An error is a tonal fill in the red or warn role with a matching hairline, never a bare red line. A stated limitation is `NoticeLine` and is shown, not hidden.

The 404 is a designed page. Routes that moved are forwarded in `next.config.ts` rather than left to it.

## 9. Motion

Motion is feedback. What animates: background colour, border colour, text colour, meter width. What does not: radius, layout, position. There are no transforms in the product, which is why `prefers-reduced-motion` only needs to cut durations.

## 10. The contract

A screen ships only if all of these hold.

1. **The brand is the source.** Colour, type and shape come from alachrsolutions.com. Inventing a value that the site already answers is a bug.
2. **Depth is a lighter surface plus a hairline.** Not a shadow.
3. **Everything is square.** Nothing exceeds a 10px radius and there are no pills.
4. **The accent marks the top of a screen.** Page titles are periwinkle, panel headings are white.
5. **Navy is the ground, not an accent.** No navy text on a navy surface.
6. **Hover elevation is opt in.** Only `.panel-interactive` reacts, and only when it is genuinely clickable.
7. Every status has colour, icon, and word.
8. Nothing is smaller than 10px, and nothing below 12px carries prose.
9. Numbers are tabular and right aligned in tables.
10. Reasoning prose is capped at 68ch.
11. Every claim the app makes shows its evidence with a date and a source.
12. Empty, loading, and error states exist and are designed.
13. Icons are Lucide 16px stroke 1.5. No emoji.
14. Nothing important lives behind hover. Hover reveals shortcuts, never primary information.
15. Keyboard focus is always visible: a 2px accent outline at 2px offset, from the one rule in `globals.css`. Nothing may clip it.
16. No new button or field string in a page file. Use the recipe.
17. There is one colour token set, `--alac-*`. No second palette and no appearance named aliases.
18. The logo is the `Logo` component. Never a second copy of the asset.
19. No em dashes in any UI copy.
20. Checked at 1440x900 and at 390x844 before the change is pushed.
