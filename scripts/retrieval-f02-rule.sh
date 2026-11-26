#!/bin/sh
# Run only inside the proved gateway namespace. The caller owns scope and lifecycle checks.
set -eu

operation=$1
tag=$2
interface=$3
address=$4
port=$5
cutoff=$6
seconds=$7
case "$tag" in
    pctv-f02-*) ;;
    *) exit 2 ;;
esac
case "$tag" in *[!a-z0-9-]*) exit 2 ;; esac
[ "$seconds" -ge 1 ] && [ "$seconds" -le 30 ] || exit 2
state="/tmp/$tag"

# iptables serializes its own mutations. This lock also serializes our close marker
# with insertion, preventing a delayed Docker exec from adding a rule after cleanup.
lock_trial() {
    exec 9>"$state/lock"
    # Another operation may hold the lock across up to three -w 2 calls.
    attempts=0
    until flock -xn 9; do
        attempts=$((attempts + 1))
        [ "$attempts" -lt 75 ] || exit 3
        sleep 0.1
    done
}

rule() {
    iptables -w 2 "$@" -o "$interface" -d "$address" -p udp --dport "$port" \
        -m comment --comment "$tag" -m time --datestop "$cutoff" -j DROP
}

has_tag() {
    rules=$(iptables -w 2 -S OUTPUT) || exit 3
    printf '%s\n' "$rules" | awk -v tag="$tag" '
        { for (i = 1; i < NF; i++) if ($i == "--comment" && $(i+1) == tag) found=1 }
        END { exit !found }
    '
}

close_trial() {
    lock_trial
    : >"$state/closed"
    if has_tag; then
        rule -D OUTPUT
    fi
    if has_tag; then
        exit 3
    fi
}

case "$operation" in
    arm)
        umask 077
        mkdir "$state"
        : >"$state/ready"
        sleep "$seconds"
        close_trial
        ;;
    ready)
        [ -f "$state/ready" ]
        ;;
    insert)
        [ -f "$state/ready" ] || exit 4
        lock_trial
        [ ! -e "$state/closed" ] || exit 4
        if has_tag; then
            exit 4
        fi
        rule -I OUTPUT 1
        ;;
    observe)
        lock_trial
        [ ! -e "$state/closed" ] || exit 4
        rule -C OUTPUT
        counters=$(iptables -w 2 -nvxL OUTPUT) || exit 3
        printf '%s\n' "$counters" | awk -v tag="$tag" '
            { for (i = 2; i < NF; i++)
                if ($(i-1) == "/*" && $i == tag && $(i+1) == "*/") {
                    count++; packets=$1
                }
            }
            END { if (count != 1) exit 3; print packets }
        '
        ;;
    close)
        close_trial
        ;;
    *) exit 2 ;;
esac
