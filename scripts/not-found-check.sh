#!/bin/sh
# Not-found matrix (#177, spec deploy-homelab R3a): checks the status and the content type
# Caddy answers for each path. Usage: scripts/not-found-check.sh [base-url] (default local
# staging). Runs every line, then exits 1 if any line failed.
set -u
BASE="${1:-https://localhost:8443}"
fails=0

# check METHOD PATH STATUS TYPE-PREFIX
check() {
  # -X HEAD would wait for a body that never comes: HEAD goes through -I.
  if [ "$1" = HEAD ]; then m=-I; else m='-X GET'; fi
  # shellcheck disable=SC2086
  out=$(curl -ksS -o /dev/null $m --max-time 10 -w '%{http_code} %{content_type}' --path-as-is "$BASE$2")
  code=${out%% *}
  type=${out#* }
  case "$code $type" in
    "$3 $4"*) printf 'ok   %-5s %-45s %s\n' "$1" "$2" "$out" ;;
    *) printf 'FAIL %-5s %-45s %s (want %s %s)\n' "$1" "$2" "$out" "$3" "$4"; fails=$((fails + 1)) ;;
  esac
}

asset=$(curl -ksS "$BASE/" | sed -n 's|.*src="\(/assets/[^"]*\.js\)".*|\1|p' | head -1)
[ -n "$asset" ] || asset=/assets/no-entry-script-found

check GET  /                                     200 text/html
check GET  '/?x=1'                               200 text/html
check GET  /index.html                           200 text/html
check HEAD /                                     200 text/html
check GET  /favicon.svg                          200 image/svg+xml
check GET  "$asset"                              200 text/javascript
check GET  /assets/index-00000000.js             404 text/html
check GET  /assets/                              404 text/html
check GET  /nope                                 404 text/html
check HEAD /nope                                 404 text/html
check GET  '/nope?x=1'                           404 text/html
check GET  /nope/                                404 text/html
check GET  /a/b/c/d                              404 text/html
check GET  /.env                                 404 text/html
check GET  /.git/config                          404 text/html
check GET  /openapi.json                         404 text/html
check GET  /docs                                 404 text/html
check GET  /index.html/x                         404 text/html
check GET  /%2e%2e/%2e%2e/etc/passwd             404 text/html
check GET  /api/health                           200 application/json
check GET  '/api/..%2fassets/x.js'               404 application/json
check GET  /api                                  404 application/json
check GET  '/api/artwork/..%2f..%2fetc%2fpasswd' 404 application/json
check GET  '/api/..%2f..%2fnope'                 404 application/json
check GET  '/api/%2e%2e/nope'                    404 application/json
check GET  /api/../nope                          404 application/json

# The 404 page carries the site's security headers (handle_errors runs its own routes).
if curl -ksSI --max-time 10 "$BASE/nope" | grep -qi '^content-security-policy:'; then
  echo 'ok   404 page sends the CSP'
else
  echo 'FAIL 404 page without CSP'; fails=$((fails + 1))
fi

[ "$fails" -eq 0 ] || { echo "$fails check(s) failed"; exit 1; }
