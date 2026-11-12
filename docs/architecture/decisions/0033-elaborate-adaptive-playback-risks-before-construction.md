# ADR-0033 — Elaborate adaptive playback risks before construction

- Status: proposed; owner implementation order approved, detailed dossier not yet accepted.
- Date: 2026-11-12
- Scope: #306 / #307, `adaptive-wishlist`.
- Method: risk-first UP elaboration, proportional to a solo project. This records a study method, not selection of a recovery backend.

## Context and drivers

The feature spans private wishes, acquisition authorization, temporary storage, partial-file playback and notifications. Backend range verification and decoder behavior remain unproven. Existing local-file playback cannot establish progressive feasibility. Study the domain/lifecycle and isolate the protocol spike before construction.

## Comparison

Judgment scores 0–5, not measurements. Weights total 100. A: risk-first UP elaboration. B: hybrid UP/ICONIX. C: ICONIX alone.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Retire unknown media/backend risks first | 45 | 5 — explicit elaboration spike before construction | 4 — supports elaboration but detailed use-case allocation can precede evidence | 2 — short path to design assumes more stable behavior |
| Proportionate artifact effort | 30 | 4 — bounded spec and selected views | 4 — same views plus interaction allocation | 5 — shortest understood-use-case path |
| Traceability into later implementation | 25 | 4 — requirements/state and planned cases, class detail deferred | 5 — explicit interaction-to-responsibility allocation | 4 — strong use-case traceability, risk experiment separate |
| Total | 100 | **445/500** | **425/500** | **340/500** |

A versus B: the unknown is whether partial bytes can be played safely; delaying detailed class/API allocation until the spike avoids treating guessed protocol capabilities as facts. B is the design fallback once evidence stabilizes. Sensitivity: transferring ten weight points from risk retirement to traceability gives A 435 and B 435; rankings depend on prioritizing the unresolved media risk. Scores and weights await owner validation with this dossier.

## Proposed outcome

Use A for #307/#308: user-goal texts, analysis concepts, state and sequence/component/data-flow views, requirements and planned cases. After a successful #308 report, refine the accepted protocol, concrete limits, persistence and API contracts in the implementation bricks. No generic provider framework or speculative class hierarchy.

Fallback B costs an interaction/operation allocation pass after the spike; it does not require a runtime migration. Full-file playback is a safety behavior, not an accepted replacement for the owner's progressive-playback goal.

## Consequences

Episode notices, original/French audio with French subtitles and automatic signed-in-user acquisition are now owner-confirmed. Remaining quality/size, resource and backend decisions stay explicit. No backend installation, runtime privilege change, real source request or deployment has been performed; runtime changes must implement the newly confirmed user-triggered acquisition policy through the accepted technical boundary. Existing application tests and local CI passed as recorded in the #307 QA report; future recovery tests are not implemented. Diagram rendering was not run. Acceptance of this methodology does not establish technical feasibility.
