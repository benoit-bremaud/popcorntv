# QA report — #177 real 404 for unknown paths

Targeted pass on local staging (`make staging-up`, https://localhost:8443) on 2026-11-08,
branch `fix/177-real-404-view` at ffea2b8, with `make check-not-found`.

## Result

OK: every line of the matrix passes, `/api/health` answers `{"status":"ok"}`.

```text
ok   GET   /                                             200 text/html; charset=utf-8
ok   GET   /?x=1                                         200 text/html; charset=utf-8
ok   GET   /index.html                                   200 text/html; charset=utf-8
ok   HEAD  /                                             200 text/html; charset=utf-8
ok   GET   /favicon.svg                                  200 image/svg+xml
ok   GET   /assets/main-B9qJB85U.js                      200 text/javascript; charset=utf-8
ok   GET   /assets/index-00000000.js                     404 text/html; charset=utf-8
ok   GET   /assets/                                      404 text/html; charset=utf-8
ok   GET   /nope                                         404 text/html; charset=utf-8
ok   HEAD  /nope                                         404 text/html; charset=utf-8
ok   GET   /nope?x=1                                     404 text/html; charset=utf-8
ok   GET   /nope/                                        404 text/html; charset=utf-8
ok   GET   /a/b/c/d                                      404 text/html; charset=utf-8
ok   GET   /.env                                         404 text/html; charset=utf-8
ok   GET   /.git/config                                  404 text/html; charset=utf-8
ok   GET   /openapi.json                                 404 text/html; charset=utf-8
ok   GET   /docs                                         404 text/html; charset=utf-8
ok   GET   /index.html/x                                 404 text/html; charset=utf-8
ok   GET   /%2e%2e/%2e%2e/etc/passwd                     404 text/html; charset=utf-8
ok   GET   /api/health                                   200 application/json; charset=utf-8
ok   GET   /api/..%2fassets/x.js                         404 application/json
ok   GET   /api                                          404 application/json
ok   GET   /api/artwork/..%2f..%2fetc%2fpasswd           404 application/json
ok   GET   /api/..%2f..%2fnope                           404 application/json
ok   GET   /api/%2e%2e/nope                              404 application/json
ok   GET   /api/../nope                                  404 application/json
ok   404 page sends the CSP
```

## Findings fixed during the pass

- The 404 page came without the CSP and the other security headers: `handle_errors` runs
  its own routes, not the site's `header` directives. Fixed with the shared
  `(popcorntv_headers)` snippet; the matrix now checks the CSP.
- `/api/..%2fassets/<file>` reached the assets route (HTML or JavaScript): fixed with the
  `@assets` matcher that excludes a raw `/api` path.
- `/index.html/x` was a bare `400` from `file_server`: fixed with `@missing not file {path}
  {path}index.html` → `error 404`.

## Not covered

- The Pi: the homelab Caddyfile reaches bb-homelab on the next owner deploy (matrix step 5
  in `docs/testing/qa-matrix.md`).
- The rendering of the 404 page in a browser (the built-in browser refuses the self-signed
  certificate); its stylesheet is a hashed asset answering `200`.
