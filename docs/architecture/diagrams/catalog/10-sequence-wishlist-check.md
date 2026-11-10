# Sequence diagram — catalog — wishlist availability check

How the timer turns a wishlist title's arrival into an in-app notification, and how the
viewer reads it.

> **Feature**: UC28 ([spec](../../specs/wishlist-notifications.md))
> **Related ADRs**: ADR-0016, ADR-0027, ADR-0030 · **Issues**: #277

## Diagram

```mermaid
sequenceDiagram
  participant Timer as availability-check.ts (timer)
  participant Wish as wishlist-repository.ts
  participant Cache as stale-cache.ts (providers)
  participant Tmdb as tmdb-client.ts
  participant Notes as notification-repository.ts
  actor Viewer
  participant Bell as NotificationBell (React)
  participant Routes as discover/routes.ts

  Timer->>Wish: checkTargets() (distinct titles, rows, local match)
  loop each title, one at a time
    opt TMDB configured
      Timer->>Cache: get(kind:id)
      alt cached
        Cache-->>Timer: offers
      else miss
        Cache->>Tmdb: watchProviders(kind, id)
        Tmdb-->>Cache: FR offers
        Cache-->>Timer: offers
      end
    end
    loop each profile row of the title
      Timer->>Timer: availabilityEvents(seen, current, mine)
      Timer->>Notes: add(events)
      Timer->>Wish: saveSeen(current)
    end
  end
  Viewer->>Bell: pick a profile / every 5 min
  Bell->>Routes: GET /profiles/:p/notifications
  Routes-->>Bell: { items, unread }
  Viewer->>Bell: open the panel
  Bell->>Routes: PUT /profiles/:p/notifications/read
  Viewer->>Bell: click a line
  Bell-->>Viewer: Discover title sheet (Play in my library / Where to watch)
```

## Notes

- R7: a TMDB failure for a title is logged and leaves its `seen` state as it was.
