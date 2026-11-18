#!/bin/sh
# Read-only guard for the Pi staging Compose paths. It never provisions storage.
set -eu

appdata=/mnt/appdata
stage=$appdata/popcorntv-staging

refuse() {
    printf '%s\n' "pi-staging.storage_refused:$1" >&2
    exit 1
}

mountpoint -q "$appdata" || refuse appdata_not_mounted
[ "$(realpath -e "$appdata")" = "$appdata" ] || refuse appdata_path_changed
data_device=$(stat -c %d "$appdata")
[ "$data_device" != "$(stat -c %d /)" ] || refuse appdata_uses_os_device
backing=$(findmnt -n -o SOURCE --mountpoint "$appdata") || refuse appdata_source_unconfirmed
lsblk -sno TRAN "$backing" | grep -qx usb || refuse appdata_usb_unconfirmed
mount_root=$(findmnt -n -o FSROOT --mountpoint "$appdata") || refuse appdata_source_unconfirmed
[ "$mount_root" = / ] || refuse appdata_mount_root_changed

# A same-device bind can pass both realpath and device checks.
mount_targets=$(findmnt --kernel --noheadings --raw --output TARGET) || refuse mount_inventory_unconfirmed
[ -n "$mount_targets" ] || refuse mount_inventory_unconfirmed
while IFS= read -r target; do
    case "$target" in "$stage"|"$stage"/*) refuse stage_nested_mount ;; esac
done <<EOF
$mount_targets
EOF

on_appdata() {
    case "$1" in "$appdata"/*) ;; *) refuse path_outside_appdata ;; esac
    [ "$(realpath -e "$1" 2>/dev/null)" = "$1" ] || refuse path_missing_or_redirected
    [ "$(stat -c %d "$1")" = "$data_device" ] || refuse unexpected_device
}

unset DOCKER_CONTEXT DOCKER_HOST
docker_root=$(docker --host unix:///var/run/docker.sock info --format '{{.DockerRootDir}}') || refuse docker_unavailable
on_appdata "$docker_root"
containerd_root=$(python3 -c 'import tomllib; print(tomllib.load(open("/etc/containerd/config.toml", "rb"))["root"])') || refuse containerd_root_unconfirmed
on_appdata "$containerd_root"
for directory in "$stage" "$stage"/data "$stage"/cache "$stage"/media "$stage"/web "$stage"/caddy-data "$stage"/caddy-config; do
    [ -d "$directory" ] || refuse stage_directory_missing
    on_appdata "$directory"
    [ "$(stat -c '%u:%a' "$directory")" = 1000:700 ] || refuse stage_directory_not_private
done
for file in Caddyfile app.env; do
    [ -f "$stage/$file" ] || refuse stage_file_missing
    on_appdata "$stage/$file"
    [ "$(stat -c '%u:%h' "$stage/$file")" = 1000:1 ] || refuse stage_file_not_private
done
[ "$(stat -c %a "$stage/app.env")" = 600 ] || refuse stage_env_not_private
printf '%s\n' pi-staging.storage_verified
