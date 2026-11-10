# Sequence — set and open a personal title link

The owner saves a link for a title; a viewer later opens it in a new tab without the server
ever reaching the link.

> **Feature**: UC30 Open my own link for a title ([spec](../../specs/title-link.md))
> **Related ADRs**: ADR-0031

```mermaid
sequenceDiagram
  actor Owner
  participant Web as Web (TitleLink)
  participant API as Server (title-link routes)
  participant DB as SQLite (title_links)
  actor Viewer
  participant Tab as New browser tab

  Owner->>Web: open title sheet
  Web->>API: GET /title-links/:kind/:tmdbId
  API->>DB: select by (kind, tmdb_id)
  DB-->>API: row or none
  API-->>Web: { url, editable: true }
  Owner->>Web: Add my link, Save
  Web->>API: PUT /title-links/:kind/:tmdbId { url }
  alt owner and URL valid (http/https, host, no credentials, ≤ 2048)
    API->>DB: upsert (kind, tmdb_id, url)
    API-->>Web: 204
  else not owner
    API-->>Web: 403 forbidden
  else invalid URL
    API-->>Web: 400 invalid_request
  end
  Viewer->>Web: open title sheet
  Web->>API: GET /title-links/:kind/:tmdbId
  API-->>Web: { url, editable: false }
  Viewer->>Tab: Open my link (target=_blank, rel=noopener noreferrer)
  Note over API,Tab: the server never fetches, proxies nor embeds the link
```
