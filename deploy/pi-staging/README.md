# PopCornTV isolated staging on the Pi

Run PopCornTV staging in its own Compose project on the Pi's mounted USB disk, with a dedicated HTTPS ingress and data independent from production and other applications.

## Deployment prerequisites

- The Pi needs Docker Compose v2 and Python 3.11 or later. The storage guard
  reads the local containerd configuration with Python's `tomllib`.
- Qualify the exact ARM64 app and Caddy artifacts before deploying. Set
  `PCTV_STAGE_IMAGE` and `PCTV_STAGE_CADDY_IMAGE` to locally loaded, approved
  immutable references. The launcher verifies each image ID or repository
  manifest digest and its Linux ARM64 platform.
  The app and its one-shot asset copier use that same reference. No application port is
  published. The one-shot copier has no network.
- Set `PCTV_STAGE_HOST=popcorntv-staging.bb-homelab.local` and resolve it to the
  Pi's verified `tailscale0` IPv4 address on the QA clients. Set
  `PCTV_STAGE_TAILNET_IP` to that address, and check that TCP 8443 is
  still free. Choose a non-overlapping `PCTV_STAGE_SUBNET` and reserve the fixed
  in-bridge `PCTV_STAGE_PROXY_IP` for Caddy. Never bind to a wildcard. Caddy
  rejects non-Tailnet IPv4 connection sources and uses its own internal CA.
- Recheck available memory, disk and existing workload. The application and
  Caddy limits total 2.25 GiB once the one-shot copier exits. The copier is
  bounded at 256 MiB. These are test budgets for the staging frontend and API.
  Adding retrieval and discovery needs its own capacity review before enablement.
- Prepare `/mnt/appdata/popcorntv-staging` **only after** verifying that
  `/mnt/appdata` is the expected mounted USB filesystem. Use private `data`,
  `cache`, `web`, `caddy-data` and `caddy-config` directories writable by UID 1000.
  Use a separate `media` directory with licensed or synthetic fixtures. Copy
  this versioned Caddyfile to the staging root. Put only staging settings and
  credentials in the mode-0600 `app.env`. No volume or file is shared with prod.
- The staging image set, exact environment values and launch need separate review
  and approval. The production homelab reference currently uses the shared
  Caddy. Prepare its independent project ingress separately after staging
  qualification. No production changes belong to this staging recipe.

## Build the native ARM64 application image

Archive the approved Git revision and transfer the archive to a working
directory on the Pi's mounted USB disk. Record the SHA-256 on the approved
checkout and carry that value to the Pi through the authenticated release
handoff. The Pi build uses Git to read the archive's commit identity.

```sh
revision=$(git rev-parse --verify HEAD)
git archive --format=tar --output=/path/to/popcorntv-release.tar "$revision"
sha256sum /path/to/popcorntv-release.tar
```

On the Pi, run the build script from the reviewed release with the
uncompressed Git archive and the trusted checksum recorded on the checkout. Set
`archive_sha256` to the recorded 64-character value before running the command.

```sh
sh deploy/pi-staging/build-image.sh /path/to/popcorntv-release.tar "$archive_sha256"
```

The script verifies a private snapshot against that checksum before handing
it to Docker. The build uses the archive's full commit for the revision label and its first
12 characters for `APP_VERSION`. It prints the build invocation's immutable
image ID after checking its Linux ARM64 platform, revision, and baked version.
Qualify that image ID before assigning it to `PCTV_STAGE_IMAGE`. Omit
`APP_VERSION` from the runtime `app.env` so the image supplies the version.

After deployment, compare authenticated `/api/version` and the account-menu
label with the 12-character archive commit prefix. The public `/api/health` response remains the
health-only contract.

## Preflight and staging launch

From the authorized checkout on the Pi, export the six `PCTV_STAGE_*`
interpolation variables in the shell. Review the exact staging Compose model,
then use the guarded launch command once the deployment is approved:

```sh
docker --host unix:///var/run/docker.sock compose \
  --project-name popcorntv-pi-staging --env-file /dev/null \
  -f deploy/pi-staging/compose.yml config --no-env-resolution
sh deploy/pi-staging/start.sh
```

The guard checks the installed Caddyfile against the reviewed checkout. It also
checks the USB mount separately from the OS disk, the actual Docker
and configured containerd roots, canonical project bind paths, and private
staging ownership and modes. It rejects mountpoints at or within the staging
tree and staging configuration files with additional hard links. The launch
script verifies that `PCTV_STAGE_TAILNET_IP` matches `tailscale ip -4` and is
assigned to the Pi's `tailscale0` interface in the Tailnet range. Storage and
image inspection and launch target the same local Docker socket. Compose refuses
missing bind paths. Docker
logs rotate on the daemon's USB data root. Containers have no automatic restart,
so an absent USB mount during boot does not bypass the supported startup guard.
The application filesystem is read-only outside the explicit staging binds and
its temporary filesystem. The `PopCornTV staging Root` authority survives
restarts in its dedicated data directory. Keep `skip_install_trust` enabled.

After startup, verify HTTPS from a QA client. Compose waits for the application
health check and for Caddy to run. Caddy readiness is confirmed by requesting
the health endpoint through the staging origin using the staging CA:

```sh
stage_ca=$(mktemp)
ssh benoit@bb-homelab 'cat /mnt/appdata/popcorntv-staging/caddy-data/caddy/pki/authorities/local/root.crt' >"$stage_ca"
openssl x509 -in "$stage_ca" -noout -subject -fingerprint -sha256
curl --fail --silent --show-error --cacert "$stage_ca" https://popcorntv-staging.bb-homelab.local:8443/api/health
rm -f -- "$stage_ca"
```

For browser QA, copy only the public root certificate through the trusted
SSH connection and identify it by its SHA-256 fingerprint. Import it under
**Settings → Privacy & Security → Certificates → View Certificates →
Authorities** in a dedicated Firefox QA profile. Limit trust to that profile.
After QA, remove the matching authority in that profile's **Authorities**
tab and delete any temporary public certificate file. Keep the operating
system trust store and everyday browser profiles free of the staging authority.

If startup partially fails, inspect this project's Compose logs and stop the
project using the command below. Retain its data. Before switching application
versions, stop staging with the current deployment settings. Then select the
new immutable reference and run the guarded launcher so the previous Caddy
process cannot serve during asset replacement.

Run the [FULL checklist](../../docs/testing/qa-full-staging-checklist.md) on this
Pi staging origin. To stop staging, use the Compose command above with `down`
in place of `config --no-env-resolution` and the same interpolation values.
Keep its bind directories. Use the approved
staging backup for fixture rollback. Promote the exact validated application image
to the separate production project after approval. Production has no QA or smoke run.


## Operator SSH and current preparation hold

The owner runs all further Pi SSH commands from a terminal. The staging
origin is `https://popcorntv-staging.bb-homelab.local:8443`. Add this
entry to `/etc/hosts` on each Linux QA client using the Pi's actual Tailnet IPv4:

```text
<pi-tailnet-ip> popcorntv-staging.bb-homelab.local
```

Compare `getent ahostsv4 popcorntv-staging.bb-homelab.local` on the QA client
with `tailscale ip -4` on the Pi. The launcher rejects the bare
`bb-homelab` name because HSTS would apply to other services on that host
across ports. It also reserves the production hostname for production
because the session cookie is scoped by hostname.

Before the first approved startup, install the Caddyfile from the reviewed
revision on the staging USB disk. The launcher refuses to use a previous
copy. The dedicated authority is created on first startup.

Root preparation can proceed separately from the image hold. On the Pi, verify
the exact mounted USB disk first and create only the new staging root using
interactive sudo. As the operator:

```sh
set -e
mountpoint -q /mnt/appdata
[ "$(stat -c %d /mnt/appdata)" != "$(stat -c %d /)" ]
lsblk -sno TRAN "$(findmnt -n -o SOURCE --mountpoint /mnt/appdata)" | grep -qx usb
[ "$(id -u)" = 1000 ]
[ ! -e /mnt/appdata/popcorntv-staging ]
[ ! -L /mnt/appdata/popcorntv-staging ]
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" /mnt/appdata/popcorntv-staging
```

The owner confirmed the newly created USB staging root is mode 0700. The following
step runs over SSH as the normal operator and creates only the known staging
directories. Paste the entire block into the local terminal:

```sh
ssh benoit@bb-homelab 'sh -eu -s' <<'PCTV_STAGE'
fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

disk=/mnt/appdata
stage="$disk/popcorntv-staging"
printf 'Host: %s\n' "$(hostname)"
mountpoint -q "$disk" || fail "$disk is not mounted"
disk_dev=$(stat -c %d "$disk") || fail "Cannot read disk device"
root_dev=$(stat -c %d /) || fail "Cannot read root device"
[ "$disk_dev" != "$root_dev" ] || fail "Disk and root share the same filesystem"
source=$(findmnt -n -o SOURCE --mountpoint "$disk") || fail "Cannot identify mount source"
transport=$(lsblk -sno TRAN "$source") || fail "Cannot identify disk transport"
printf '%s\n' "$transport" | grep -qx usb || fail "Mount source has no USB transport"
[ "$(id -u)" = 1000 ] || fail "SSH user UID is not 1000"
[ "$(realpath -e "$stage")" = "$stage" ] || fail "Staging root is missing or resolves elsewhere"

expected="1000:700:$disk_dev"
[ "$(stat -c '%u:%a:%d' "$stage")" = "$expected" ] ||
    fail "Unexpected owner, permissions, or filesystem on staging root"

for name in data cache media web caddy-data caddy-config; do
    path="$stage/$name"
    [ ! -L "$path" ] || fail "$path is a symbolic link"
    if [ ! -e "$path" ]; then
        mkdir -m 0700 -- "$path" || fail "Cannot create $path"
    fi
    [ -d "$path" ] || fail "$path is not a directory"
    [ "$(stat -c '%u:%a:%d' "$path")" = "$expected" ] ||
        fail "Unexpected owner, permissions, or filesystem on $path"
    printf 'OK: %s\n' "$name"
done

printf '%s\n' staging-directories-ready
PCTV_STAGE
```

The operator confirmed `staging-directories-ready` on `bb-homelab` on
2026-11-18. A candidate Caddyfile and private `app.env` were subsequently
installed on the USB disk. Refresh the Caddyfile from the approved checkout.

The first two official Caddy candidates failed the blocking artifact scan. A
versioned ARM64 candidate built from an upstream commit passed the same scan
on the PC and was verified after import on the Pi. The Pi exposes it by its
OCI manifest digest. See the [Pi preparation record](../../docs/architecture/qa/2026-11-18-pi-staging-preparation.md)
for the scan identities and network findings. Before startup, complete the
delivery gate and recheck the dedicated bridge and Tailnet bind against the
current host inventory.
