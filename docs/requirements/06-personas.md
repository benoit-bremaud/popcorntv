# Personas — redesign

Three short personas for the front-end redesign (#396, epic #401), derived from the
[discovery interviews](05-discovery-interviews.md) and the [vision](01-vision.md); they name who
each screen, flow and priority of the redesign serves.

- Status: **provisional** — only P1 is interviewed; P2 and P3 (#420) confirm or revise the
  personas, with the owner's validation.
- Date: 2026-11-23.
- Privacy: invented first names; no detail identifies a household member (same rules as the
  [interviews](05-discovery-interviews.md#1-privacy)).

## Evidence levels

| Level | Meaning |
|---|---|
| Interviewed | Stated by a participant in an interview |
| Proxy | Reported by another participant (a parent about a child) |
| Assumption | From the vision or the benchmark, not yet heard from a participant |

## Overview

| Persona | Actor (UML) | Evidence | Main job stories | Main surfaces |
|---|---|---|---|---|
| [Alex, the home-cinema owner](#alex-the-home-cinema-owner) | Owner, Viewer | Interviewed (P1) | J1, J2, J3, J5, J6, J8 | Projector or TV with the phone as remote; laptop for administration |
| [Léa, the young viewer](#léa-the-young-viewer) | Viewer (child account, #316) | Proxy (P1) | J4, J6 | TV with the physical remote |
| [Monique, the occasional relative](#monique-the-occasional-relative) | Viewer | Assumption | J5, J6 | TV or tablet, touch or remote |

## Alex, the home-cinema owner

- **Who**: adult, runs the homelab and PopCornTV; watches alone or with the children.
- **Context**: evenings on the Android / Google TV projector or the living-room TV; also laptop,
  tablet and phone. Administration (libraries, accounts, invitations) on the laptop.
- **Inputs**: the phone as the remote (first choice), keyboard and mouse, touch.
- **Goals**: pick and start a film from the sofa without hunting for the remote (J1); choose in
  minutes rather than 10–20 (J2); read the synopsis and play a trailer on request before deciding
  (J3); reliable playback with the right language and subtitles (J5); resume anywhere (J6).
- **Frustrations**: too much choice and awkward remote input; playback or cast instability, wrong
  language or subtitles, a missing file; anything that plays with sound unasked.
- **Also**: allows one title above a child's rating without lifting the filter (J8); wants the room
  to follow the film (J7, outside the redesign, #419).
- **Design consequences**: phone remote screens are first class; one activation from *Continue
  watching* (G3); trailer only on request (#413); administration stays a laptop task but must work
  on a phone.

## Léa, the young viewer

- **Who**: child aged about 8–13, reads short labels; younger siblings (6–7) recognise posters
  and are read to.
- **Context**: the living-room TV after school or at the weekend, often alone.
- **Inputs**: the physical TV remote (arrows, OK, Back); no phone, no keyboard.
- **Goals**: find and start her show on her own; resume where she stopped (J6); stop at a clear
  end, no episode chaining (J4).
- **Frustrations**: titles she may not watch, text too small from the sofa, menus deeper than a
  few steps, a sign-in that needs typing.
- **Design consequences**: poster-first rows, short French labels, large focus states (NFR-15),
  no autoplay of the next episode for her account, an end-of-show screen; content restriction
  applies per account (#316, REQ-26 / REQ-27) — J4 and J8 say "profile", #316 decides.

## Monique, the occasional relative

- **Who**: older adult visiting or living nearby; not technical; comfortable with a TV remote and
  a tablet.
- **Context**: watches with the family or alone on a tablet, a few times a month.
- **Inputs**: TV remote, touch.
- **Goals**: start what the family recommended, in French, with readable subtitles (J5); resume
  it later (J6).
- **Frustrations**: small or low-contrast text, icons without labels, settings hidden behind hover,
  being asked to choose things she does not understand (audio codecs, versions).
- **Design consequences**: text labels next to icons, ≥ 44 px targets (G5), readable type at
  3 m (G6, NFR-15), plain French wording, sensible defaults (language, subtitles) per profile.

## Open points

- P2 and P3 (#420) may change the child's age range, add a second adult viewer, or replace the
  relative persona.
- Profile versus account for the children's restriction: J4 / J8 wording against #316; settled
  in #316, not in the redesign.
