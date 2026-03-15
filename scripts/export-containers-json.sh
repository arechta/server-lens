#!/usr/bin/env bash
# Debug: export only container items from server-lens --json to server-lens.json
# Run on Linux server from project root or where server-lens is installed.
# Requires: server-lens (or bun run), jq
#
# Preferred (no jq, no pipe — avoids "Unfinished string at EOF" on large payloads):
#   server-lens --json --category container --output server-lens.json
#
# With jq (only if output is small; else use --output):
#   server-lens --json --output /tmp/sl.json && jq '.tools |= map(select(.category == "container"))' /tmp/sl.json > server-lens.json

set -e
OUT="${1:-server-lens.json}"

# Write directly to file; filter to containers only (no pipe = no truncation)
server-lens --json --category container --output "$OUT"
echo "Wrote container-only snapshot to $OUT"
