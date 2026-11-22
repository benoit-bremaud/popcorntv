# Discovery interviews — Jobs to be Done

Interview guide and synthesis for the redesign's discovery (#395, epic #401): what household
members are trying to get done when they watch at home, written as job stories that feed the
[brief](04-redesign-brief.md) goals and the personas of #396.

- Status: P1 done (2026-11-23); P2 and P3 pending (#420).
- Participants: 3–4 household members or relatives, about 20 minutes each, one at a time.
- Interviewer: the owner; P1 (the owner) interviewed in writing on 2026-11-23, with closed
  questions and free answers, plus two follow-up rounds.

## 1. Privacy

The repository is public. Only the synthesis below is committed: participants are `P1`–`P4`
with an age band and a viewing context, never a name, a recording or verbatim notes. Raw notes
stay with the interviewer and are deleted once the synthesis is validated.

Opening script (read aloud): *"I'm improving the home video app. There are no right answers; I
want to hear how you really watch, not what you think of the app. I will take notes without your
name, and only a summary will be kept. Shall we start?"*

## 2. Guide (8 questions)

Ask about a real, recent evening, not opinions. Follow each answer with *"What happened next?"*,
*"Why did that matter?"* or *"What did you do instead?"*.

1. **Last time** — Think of the last time you watched a film or a series at home. Walk me through
   it, from the moment you thought "let's watch something".
2. **Setting** — Where were you, on which screen, with whom, and what did you hold to control it
   (remote, phone, keyboard, mouse)?
3. **Choosing** — How did you decide what to watch? What did you look at, and how long did it take?
4. **Friction** — What almost made you give up, or switch to something else (another app, TV,
   phone)?
5. **Coming back** — When did you last stop in the middle and come back later? How did you find
   your place again?
6. **Comfort** — Tell me about a time something made watching hard: language, subtitles, sound,
   picture, the remote, reading small text.
7. **Alternatives** — What do you use today (Jellyfin, Netflix, a TV channel, a USB stick…)? On a
   given evening, what makes you pick one over another?
8. **Magic remote** — If a remote could do one thing for you that nothing does today, what would
   it be?

Close: *"Is there anything I should have asked?"* Then thank the participant.

## 3. Note template (one per participant, kept off the repository)

- Participant: `P#`, age band, usual screen and input, watches alone or with others.
- Timeline of the last evening: trigger → choosing → playing → stopping.
- Forces: push (what was wrong before), pull (what attracted), anxieties, habits.
- Quotes rephrased in the interviewer's words; candidate job stories.

## 4. Participants

| ID | Age band | Usual screen and input | Watches with | Interviewed |
|---|---|---|---|---|
| P1 | Adult, owner | Android / Google TV projector and living-room TV, also laptop, tablet, phone; phone as the remote, keyboard / mouse, touch | Alone, sometimes with children aged 6–13 | 2026-11-23 (written) |
| P2 | — | — | — | pending |
| P3 | — | — | — | pending |
| P4 | — | — | — | optional |

## 5. Job stories

Format: *When* [situation], *I want to* [motivation], *so I can* [expected outcome]. Each story
names its participants and the brief goal or requirement it supports.

| ID | Job story | Participants | Supports |
|---|---|---|---|
| J1 | When I sit in front of the projector, I want to browse, start and control the film from my phone (pick, play / pause, ±10 s, audio and subtitles, arrows and OK), so I can stay on the sofa without hunting for a remote or squinting at the big screen | P1 (top priority) | D6, #417, #418, G3, G4, NFR-15 |
| J2 | When I have no film in mind, I want suggestions drawn from what I watched (genres, cast, similar titles), my own library first, filtered by mood or running time, so I can choose in minutes instead of 10–20 | P1 | #160, G3, #396 |
| J3 | When a poster catches my eye, I want to read the synopsis, rating and cast and play the trailer on request, so I can decide without leaving the choice | P1 | D4 / #413 (on request, no autoplay) |
| J4 | When my children watch, I want a profile that shows only titles rated for 6–13, opens in French without subtitles and does not chain episodes, so they can start their show on their own and stop at a clear end | P1 | #316, #396, D3, G7 |
| J8 | When I judge that my child can watch a title above their profile's rating, I want to allow that one title for their profile, so they can watch it without lifting the filter for everything else | P1 | #316, #396 |
| J5 | When I press Play on the big screen, I want playback to start reliably with the right language and subtitles and readable text from the sofa, so I do not fall back on another app | P1 | G6, NFR-12, NFR-15, D5 |
| J6 | When I stop in the middle, I want to resume where I left off on any screen, so I never search for my place | P1 (works today) | G3 |
| J7 | When I start a film on the projector, I want PopCornTV to trigger my cinema scene (lights, screen) and react to pause, so the room follows the film | P1 | #419 (outside the redesign) |

## 6. Findings for the brief

Provisional, from P1 only; confirmed or revised once P2 and P3 are done.

- **The big screen is Android / Google TV, not a TV browser.** The projector and the TV run
  Android / Google TV and also receive casts from the phone; this decides D6 in the brief.
- **The phone is the remote.** The most wanted feature, ahead of suggestions, reliability and a
  children's profile (J1).
- **The children's filter needs owner overrides**: a per-title allowance for one child's profile
  (J8).
- **Choosing is the slow part**: 10–20 minutes, too much choice, awkward remote input (J2, J3).
- **Reliability decides the app of the evening**: playback or cast instability, language and
  subtitles, sound and picture, a missing file — every one was seen (J5).
- **Trailers on request only**, no autoplay (J3), consistent with the autoplay finding cited
  in #413.
- **Resume works today** and must not regress (J6).
- **Out of the redesign's scope**: suggestions engine (J2), children's ratings and overrides
  (J4, J8) and home-automation scene (J7) need
  their own issues and ADRs; the redesign leaves room for them in the screens.
