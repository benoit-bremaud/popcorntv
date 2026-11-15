# Empty local discovery services

This separate installation provisions authenticated Prowlarr and a corrected Radarr build without indexers, download clients, media mounts or external searches.

## Build prerequisites

Run commands from the repository root. Install Docker with Buildx/Compose and the
locked tools through `mise x -- just setup`. Obtain your own Six Labors license
from <https://licensing.sixlabors.com/>: the corrected ImageSharp package validates
it during compilation. The owner's Community license was received on 2026-11-14
and expires on 2028-02-12. That credential is not distributed with this project.
Keep the file outside the repository, readable only by your user. Never commit,
print or pass its contents as a build argument or environment variable.

```sh
mise x -- just discovery-build /absolute/path/to/sixlabors.lic
```

Bake pins the official source archive, compiler and runtime bases. The build
replaces the entire published application, compiles the dynamically loaded Linux
component, omits the disabled updater, and builds the UI from the same source revision. The
license is a required BuildKit secret, absent from build context and final image.
The custom assembly version/configuration identifies this local build; it is not
an upstream stable release. Source and base pins do not promise byte-identical
builds across future package-registry changes; scan the actual image every time.

## Lifecycle

```sh
mise x -- just discovery-init
mise x -- just discovery-start
mise x -- just discovery-status
mise x -- just discovery-stop
```

The controller rejects remote Docker contexts. The state directory defaults to
ignored `data/local-discovery/`, with private credentials and installation
identity. Generated credentials expire after 90 days for operator rotation;
this is controller enforcement, not a claim of vendor-native key expiry. Stop
remains available after credential expiry. Preserve the state directory when
stopping; do not reset another installation or delete an owner's configuration.

Startup scans all three images with the existing blocking HIGH/CRITICAL policy. Radarr
is resolved to its local immutable image ID, checked for expected source/patch
metadata, scanned by ID and started by that same ID, avoiding a mutable tag race.
The rebuilt Caddy proxy follows the same immutable-ID rule. No automatic registry
pull is permitted for either custom image.

Bootstrap first runs without published ports, verifies empty configuration and
administrative authentication, and disables Radarr RSS grabbing. Only then does the fixed Caddy ingress publish
Prowlarr <http://127.0.0.1:19696> and Radarr <http://127.0.0.1:17878> published.
Credentials remain in the private `*-credentials.json` files; no browser-facing
PopcornTV configuration contains these keys. Repeated startup validates completed
settings without overwriting owner edits.

## Failure diagnosis and acceptance

Diagnostics report categorical failures without API bodies or credential values.
Image scan reports are under ignored `.trivy/`. A failed startup preserves state
and attempts to withdraw published ports; failed withdrawal falls back to an
owned-service stop and explicitly reports an unconfirmed stop. SIGTERM follows
that cleanup path; SIGKILL and power loss require later operator reconciliation.

The controller's tests substitute the Docker boundary and use real private files
and local HTTP servers. Their success does not prove image startup, runtime
limits, TCP/DNS egress denial or restart persistence. Those require disposable
real-container acceptance as specified in
`docs/architecture/qa/cases/327-local-discovery.md`. This installation must stay
empty; source fixtures use a separate project, state and network. No Pi deployment
or PopcornTV deployment is performed by these recipes.


## Ingress and homelab boundary

The application containers stay on their internal-only network. Caddy alone gains
a second network, with a separately preflight-allocated subnet recorded in private
state. Effective network membership and loopback bindings must match the contract.
A Compose success with missing actual bindings is refused and withdrawn.

The build recipe also rebuilds official Caddy source at the pinned corrected
revision in `ingress.Dockerfile`; stock 2.11.9 failed the dependency scan. This
snapshot is for local acceptance. The Pi's existing central Caddy is configured
in `bb-homelab/services/caddy/`; this recipe does not alter it or the existing
PopcornTV staging Caddy. A Pi deployment needs separate ARM64/runtime validation.

To run the complete disposable acceptance journey after building:

```sh
mise x -- uv run --frozen --group ci python scripts/check_python_tests.py -q scripts/tests/test_discovery_runtime.py
```

It verifies private and published startup, actual limits, TCP/DNS isolation with
positive controls, restart, and two synthetic Torznab sources. One fixture then
returns 503; a fresh search must still reach the healthy source. Their download
URLs always return 410 and serve no media. These sources exist only in temporary
state and never enter the operator installation. Ephemeral loopback ports avoid
conflicts with the operator's fixed administration ports.

The full L2 gate requires `SIXLABORS_LICENSE_FILE` to name your existing private
license file. It rebuilds both custom images and repeats real acceptance before
issuing signed evidence. Never put license contents into that variable.
