# ADR-0047 — Notify through the bell, Web Push and e-mail, chosen per profile

- Status: accepted (owner framing 2026-11-23, #434; weights validated by the owner on 2026-11-26)
- Date: 2026-11-24
- Deciders: owner
- Related: REQ-45, REQ-59, NFR-18, [data flow](../diagrams/on-demand-retrieval/06-data-flow.md); ADR-0030 (bell)

## Context

ADR-0030 keeps notifications in the app (bell polled every 5 min). A source found for an « À venir »
title is worth knowing while away from the app. The owner decided on 2026-11-23: bell always on,
plus Web Push and e-mail chosen per profile; e-mail immediate or daily digest; push quiet hours
22:00–08:00 by default. Owner rule: features are built into PopCornTV, not delegated to another
product.

## Options

- **A**: bell only (ADR-0030 unchanged).
- **B**: bell + Web Push + e-mail, per profile (owner).
- **C**: bell + e-mail.
- **D**: bell + an external messenger (Telegram, ntfy).

## Matrix

| # | Criterion | Weight | A | B | C | D |
|---|---|---|---|---|---|---|
| 1 | Reach when the app is closed | 30 | **1** E: only on next opening | **5** E: phone and desktop push, plus e-mail | **3** E: e-mail is read late | **4** E |
| 2 | Privacy (no watch data at a third party) | 20 | **5** V: stays on the host | **3** E: push payload encrypted end to end (RFC 8291), e-mail readable by the mail provider | **3** E: e-mail readable by the provider | **2** E: messages stored by the messenger |
| 3 | Built into PopCornTV (owner rule) | 15 | **5** V | **4** E: VAPID keys and an SMTP relay to configure | **4** E | **1** E: depends on another product |
| 4 | Construction and maintenance cost | 15 | **5** V: exists | **2** E: service worker, subscriptions, SMTP, digest | **3** E | **3** E |
| 5 | Control per profile | 20 | **2** E: nothing to choose | **5** E: channels, digest, quiet hours | **3** E | **3** E |
|   | **Σ** | **100** | | | | |

| Points | A | B | C | D |
|---|---:|---:|---:|---:|
| 1 (30) | 30 | 150 | 90 | 120 |
| 2 (20) | 100 | 60 | 60 | 40 |
| 3 (15) | 75 | 60 | 60 | 15 |
| 4 (15) | 75 | 30 | 45 | 45 |
| 5 (20) | 40 | 100 | 60 | 60 |
| **Total / 500** | **320** | **400** 🏆 | **315** | **280** |

Sensitivity: doubling the cost weight (15 → 30, others × 70/85) gives B 364.7, A 351.8: B holds.

## Decision

**B**, in slice 3.

- The bell stays the record (ADR-0030); push and e-mail are copies of a bell notice.
- A message carries the title and the reason ("source found", "degraded only"), never a history.
- Web Push needs HTTPS, a service worker and VAPID keys (server secrets, `.env` only); on iPhone
  it works only for the app added to the home screen.
- E-mail goes through an owner-configured SMTP relay; daily digest at a fixed hour.
- Quiet hours delay push, never drop it.

## Fallback

**A** (320/500): bell only. Activation cost: turn the channels off; drop-in.

## Consequences

- New secrets (VAPID private key, SMTP credentials) follow the credential naming and rotation rule.
- Two new egress flows in the data flow diagram, both carrying no profile history.
