#!/bin/sh
# The running app has verified the signed manifest, hash, ZIP and bundle identity.
# Keep the old app until the new process acknowledges a successful window load.
set -eu
parent_pid=$1
target=$2
stage=$3
ack=$4
token=$5
backup="$stage/previous.app"
log="$(dirname "$ack")/install.log"
exec >>"$log" 2>&1
attempt=0
while kill -0 "$parent_pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || exit 1
  sleep 1
done
# Atomic renames on the same filesystem. Never delete the previous app on failure.
mv "$target" "$backup"
if ! mv "$stage/Astral.app" "$target"; then
  mv "$backup" "$target"
  exit 1
fi
"$target/Contents/MacOS/Astral" --astral-update-ack "$token" &
new_pid=$!
attempt=0
while [ "$attempt" -lt 60 ]; do
  if [ -f "$ack" ]; then
    rm -f "$ack"
    rm -rf "$stage"
    printf 'Update started successfully.\n'
    exit 0
  fi
  kill -0 "$new_pid" 2>/dev/null || break
  attempt=$((attempt + 1))
  sleep 1
done
kill "$new_pid" 2>/dev/null || true
attempt=0
while kill -0 "$new_pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 15 ] || { printf 'New app did not exit; backup retained at %s\n' "$backup"; exit 1; }
  sleep 1
done
mv "$target" "$stage/failed.app"
mv "$backup" "$target"
printf 'Update could not start. Restored the previous version.\n'
"$target/Contents/MacOS/Astral" &
