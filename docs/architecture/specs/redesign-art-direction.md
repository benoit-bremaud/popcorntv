# Redesign — art direction: moodboard and three style tiles

Three candidate looks for the redesigned front end, drawn as style tiles in Penpot, compared by a
household preference test and an MCDA, so one direction can be recorded in ADR-0042.

- Status: **directions validated** by the owner on 2026-11-23 (#397); tiles and boards drawn
  2026-11-26 (§ 5); preference test and MCDA pending.
- Date: 2026-11-23.
- Scope: epic #401, phase 3. Feeds the wireframes (#398) and the design system (#399).
- Inputs: the [brief](../../requirements/04-redesign-brief.md) (D1 TV-ready responsive, D2 dark
  only, D3 French and English, NFR-11, NFR-13, NFR-14, NFR-15), the
  [benchmark](redesign-benchmark.md), the [personas](../../requirements/06-personas.md), the
  [screen inventory](redesign-screen-inventory.md), ADR-0004 (current look), ADR-0037 (Penpot).
- Rules: written references and links only, no third-party image in this repository; contrast
  values below are measured on the Penpot tiles (WCAG 2.2 relative luminance).

## 1. Fixed for every tile

- **Mode**: catalog, title and player are surfaces where the content leads and the interface
  recedes; administration is a task surface (density, consistency). A tile styles the first;
  the second inherits its tokens.
- **Invention level**: a redesign, so each tile is a full direction. ADR-0004's "velvet house" is
  evidence, not a look to polish; tile A is its evolution because #397 asks for one.
- **Constraints**: dark only; TV breakpoint 1920 × 1080 with a 5 % safe margin and body ≥ 28 px;
  WCAG 2.2 AA (text ≥ 4.5:1, focus indicator ≥ 3:1 and never colour-only); French strings
  drawn (longer than English); fonts self-hosted under an open licence; reduced motion keeps
  fades only (G7).
- **What each tile shows** (owner, 2026-11-23): palette with roles and contrast; type scale at
  TV and phone size; icon set; image treatment (poster, backdrop, veil under text); poster states
  including focus; buttons; motion principles; then four boards — a home hero at TV 1920, a row
  at phone 390, the player controls (style only, D5 stays with #399) and *Who's watching?* with
  the child badge.

## 2. The three directions

### A — Velvet house, refined

- **Idea**: the cinema hall — seat-velvet red marks the action, gold hairlines frame the focus.
- **Colour**: ground `#0e0b0d` warm black; surface `#1c1418`; ink `#f3ece6` (16.7:1); muted ink
  `#a89ea0` (7.5:1); red fill `#b3122e` for the one primary action (white text 6.9:1); gold
  `#c9a24a` for focus and stars (8.2:1). Navy and violet of ADR-0004 v2 are dropped: one accent
  and one focus colour.
- **Type**: Inter only (OFL, already self-hosted); titles bold with tight tracking; TV scale
  display 72 / title 48 / body 28 / meta 24 px, phone 32 / 24 / 16 / 13 px.
- **Icons**: Lucide (ISC), 1.5 px stroke.
- **Image**: backdrop dimmed under a black veil from the left edge; square-ish posters, 4 px
  radius.
- **Focus and motion**: card scales 1.06 with a 3 px gold ring, 180 ms ease-out; reduced motion:
  ring only.
- **Boldness spent on**: the red primary action, nowhere else.

### B — Projection booth

- **Idea**: the projector beam is the focus — the chosen poster is lit, the rest stays in the
  dark.
- **Colour**: ground `#0b0d10` cold black; surface `#161a20`; beam ink `#f4efe4` (17:1); muted
  ink `#8f96a3` (6.5:1); amber fill `#f2a93b` for the primary action (dark text 9.3:1).
- **Type**: Barlow Condensed (OFL) for titles and buttons, Inter for body; the condensed face
  keeps long French titles on one line of a TV row; TV display 88 / title 56 / body 28 / meta 24 px,
  phone 40 / 28 / 16 / 13 px.
- **Icons**: Tabler outline (MIT), 2 px stroke, square caps.
- **Image**: unfocused posters dimmed to 55 % brightness; the backdrop cross-fades to the focused
  title; 2 px radius.
- **Focus and motion**: the focused poster brightens and grows 1.08 with a 2 px beam-white ring,
  220 ms; reduced motion: brightness change only, no scale.
- **Boldness spent on**: the light-and-shadow contrast between the focused poster and the rest.
- **Watch**: dimmed posters must stay recognisable; a child may not read condensed capitals.

### C — Evening living room

- **Idea**: the family sofa — big soft posters and round shapes, readable by a child from across
  the room.
- **Colour**: ground `#121a2e` night blue; surface `#1c2640`; ink `#f5efe8` (15.2:1); muted ink
  `#a9b3cc` (8.3:1); coral fill `#ff7a5c` for the primary action (night-blue text 6.8:1); butter
  yellow `#ffd36e` for focus (12.2:1).
- **Type**: Nunito (OFL), rounded; TV display 72 / title 52 / body 30 / meta 24 px, phone 34 / 26 / 17 / 14 px.
- **Icons**: Phosphor bold (MIT), rounded ends.
- **Image**: posters with 14 px radius; backdrop under a night-blue veil; pill buttons.
- **Focus and motion**: card grows 1.10 with a 5 px butter ring and a soft spring, 260 ms;
  reduced motion: ring only.
- **Boldness spent on**: the size of the focused poster and its thick ring.
- **Watch**: the competitor test is weakest here (other family apps look alike).

## 3. Moodboard (references, links only)

| Direction | References |
|---|---|
| A | A single-screen cinema hall: red velvet seats, gold trim, dark walls; [Inter](https://rsms.me/inter/) |
| B | A projection booth and the visible beam through the dark; title cards of condensed lettering; [Barlow](https://github.com/jpt/barlow) |
| C | A living room at night, soft lamps, a sofa facing the TV; [Nunito](https://github.com/googlefonts/nunito) |

Icon sets: [Lucide](https://lucide.dev), [Tabler](https://tabler.io/icons),
[Phosphor](https://phosphoricons.com). Contrast checked with the WCAG 2.2 relative-luminance
formula.

## 4. Preliminary MCDA (to guide the review, not the decision)

Weights proposed for the owner's validation in step 4; the household preference test becomes one
more criterion then.

| Criterion | Weight | A | B | C |
|---|---:|---:|---:|---:|
| Strong identity (the owner's "en mettre plein la vue") | 25 | 4 | 5 | 3 |
| TV legibility at 3 m | 25 | 4 | 4 | 5 |
| Use by a child | 20 | 3 | 3 | 5 |
| Accessibility AA | 15 | 5 | 4 | 4 |
| Long French titles | 15 | 3 | 5 | 4 |
| **Total /500** | 100 | **380** | **420** | **420** |

Sensitivity: B and C tie; more weight on identity favours B, more on the child favours C.

## 5. The drawn tiles

Drawn in Penpot, file *02 · Art direction*, one page per direction; 15 boards exported to
[`docs/design/style-tiles/`](../../design/style-tiles/) (256-colour PNG). Content is fictional:
invented French titles, persona names only, no artwork.

| Board | A — Velvet house | B — Projection booth | C — Evening living room |
|---|---|---|---|
| Style tile | [tile](../../design/style-tiles/a-velvet-house-tile.png) | [tile](../../design/style-tiles/b-projection-booth-tile.png) | [tile](../../design/style-tiles/c-evening-living-room-tile.png) |
| Home hero, TV 1920 | [home](../../design/style-tiles/a-velvet-house-home-tv.png) | [home](../../design/style-tiles/b-projection-booth-home-tv.png) | [home](../../design/style-tiles/c-evening-living-room-home-tv.png) |
| Player controls, TV 1920 | [player](../../design/style-tiles/a-velvet-house-player-tv.png) | [player](../../design/style-tiles/b-projection-booth-player-tv.png) | [player](../../design/style-tiles/c-evening-living-room-player-tv.png) |
| *Qui regarde ?*, TV 1920 | [profiles](../../design/style-tiles/a-velvet-house-profiles-tv.png) | [profiles](../../design/style-tiles/b-projection-booth-profiles-tv.png) | [profiles](../../design/style-tiles/c-evening-living-room-profiles-tv.png) |
| Home row, phone 390 | [phone](../../design/style-tiles/a-velvet-house-home-phone.png) | [phone](../../design/style-tiles/b-projection-booth-home-phone.png) | [phone](../../design/style-tiles/c-evening-living-room-home-phone.png) |

Every TV board shows the 5 % safe area as a dashed guide. Observations from drawing:

- **B** holds the longest French title on one TV line; its uppercase labels need about 15 % more
  button width than Inter.
- **C** Nunito is the widest face: the subtitle cue and the nav needed more room.
- **A** is the quietest; its gold focus ring reads well on the red button but is thin at 3 m.

## 6. Next steps

1. Household preference test at the card-sort session (#429): each person picks one tile and
   gives three words why; results recorded by age band only.
2. Owner validates the MCDA weights; score; ADR-0042 records the direction and supersedes
   ADR-0004's look. Tokens move to `tokens.css` in #399.
