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

Startup scans both images with the existing blocking HIGH/CRITICAL policy. Radarr
is resolved to its local immutable image ID, checked for expected source/patch
metadata, scanned by ID and started by that same ID, avoiding a mutable tag race.
No automatic registry pull is permitted for the custom Radarr image.

Bootstrap first runs without published ports, verifies empty configuration and
administrative authentication, and disables Radarr RSS grabbing. Only then are
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
