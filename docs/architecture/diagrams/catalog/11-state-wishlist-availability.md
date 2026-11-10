# State diagram — catalog — availability of a wishlist title on one source

The life of one source (the library, or one provider) for one wishlist row, as the check sees
it; a notification is the effect of entering **Available** from **Absent**.

> **Feature**: UC28 ([spec](../../specs/wishlist-notifications.md))
> **Related ADRs**: ADR-0030 · **Issues**: #277

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Unknown: added to My list [provider source]
  [*] --> Absent: added [library source, no local match]
  [*] --> Available: added [library source, local match]
  Unknown --> Absent: check [not offered] / record baseline
  Unknown --> Available: check [offered] / record baseline, no notification
  Absent --> Available: check [present] / notify if library or one of my providers
  Available --> Absent: check [gone] / record
  Absent --> Absent: check [still absent]
  Available --> Available: check [still present]
  Unknown --> Unknown: check [TMDB failed]
  Absent --> [*]: removed from My list
  Available --> [*]: removed from My list
  Unknown --> [*]: removed from My list
```

## Notes

- A TMDB failure leaves any state as it was (R7). Adding a provider to "mine" changes no
  state, so it never notifies for an offer already seen (R5).
