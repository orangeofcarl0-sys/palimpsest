#!/bin/sh
# R1-S §8 — does a bwrap-style backend actually deliver READ confinement?
# Run under WSL with: wsl -d Ubuntu -- sh /mnt/f/.../bwrap-read-confinement.sh
set -u
R=$(mktemp -d "${TMPDIR:-/tmp}/r1s-XXXXXX") || exit 1
mkdir -p "$R/world" "$R/protected" || exit 1
printf 'canary=world-in-world\n'     > "$R/world/in.txt"
printf 'canary=protected-outside\n'  > "$R/protected/secret.txt"

echo "--- baseline: NO confinement ---"
printf 'world read:     '; cat "$R/world/in.txt"
printf 'protected read: '; cat "$R/protected/secret.txt"

echo "--- under bwrap with ONLY the world bound ---"
bwrap \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin --ro-bind /etc /etc \
  --ro-bind "$R/world" "$R/world" \
  --dev /dev --proc /proc --unshare-pid --die-with-parent --chdir "$R/world" \
  /bin/sh -c "printf 'world read:     '; cat '$R/world/in.txt'; printf 'protected read: '; cat '$R/protected/secret.txt' 2>&1 || echo BLOCKED"

echo "--- write confinement check (workspace-write shape) ---"
bwrap \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin --ro-bind /etc /etc \
  --bind "$R/world" "$R/world" \
  --dev /dev --proc /proc --unshare-pid --die-with-parent --chdir "$R/world" \
  /bin/sh -c "printf 'in-world write: '; (echo ok > '$R/world/out.txt' && echo OK) || echo BLOCKED; printf 'outside write:  '; (echo no > '$R/protected/out.txt' 2>/dev/null && echo WROTE) || echo BLOCKED"

rm -rf "$R"
