#!/usr/bin/env bash
# Test GHCR (GitHub Container Registry) token from server-lens.toml
# Usage: ./scripts/test-ghcr-token.sh [path-to-server-lens.toml]
# Or:   GITHUB_TOKEN=ghp_xxx ./scripts/test-ghcr-token.sh
#
# Manual curl test (two steps required — do NOT use your PAT as Bearer on tags/list):
#   Step 1: CREDS=$(echo -n "oauth:YOUR_GITHUB_TOKEN" | base64 | tr -d '\n')
#           curl -s "https://ghcr.io/token?service=ghcr.io&scope=repository:outlinewiki/outline:pull" -H "Authorization: Basic $CREDS"
#   Step 2: Use the "token" value from step 1 JSON as Bearer:
#           curl -s "https://ghcr.io/v2/outlinewiki/outline/tags/list" -H "Authorization: Bearer <token_from_step1>"
# If you get "invalid token": give the fine-grained PAT "Repository access" (e.g. Public repos or outlinewiki/outline) and "Packages: Read".

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOML="${1:-$PROJECT_ROOT/server-lens.toml}"

if [ -n "$GITHUB_TOKEN" ]; then
  TOKEN="$GITHUB_TOKEN"
else
  if [ ! -f "$TOML" ]; then
    echo "No server-lens.toml found at $TOML and GITHUB_TOKEN not set."
    echo "Usage: $0 [path-to-server-lens.toml]"
    echo "   or: GITHUB_TOKEN=ghp_xxx $0"
    exit 1
  fi
  TOKEN=$(grep -E '^\s*github_token\s*=' "$TOML" | sed -E 's/.*["'\'']([^"'\'']+)["'\''].*/\1/' | head -1)
  if [ -z "$TOKEN" ]; then
    echo "github_token not found in $TOML. Set GITHUB_TOKEN or add github_token to [auth]."
    exit 1
  fi
fi

OWNER="outlinewiki"
IMAGE="outline"
SCOPE="repository:${OWNER}/${IMAGE}:pull"
CREDS=$(echo -n "oauth:${TOKEN}" | base64 | tr -d '\n')

echo "1. Requesting GHCR token for scope: $SCOPE"
TOKEN_RES=$(curl -s -w "\n%{http_code}" \
  "https://ghcr.io/token?service=ghcr.io&scope=${SCOPE}" \
  -H "Authorization: Basic ${CREDS}")

HTTP_CODE=$(echo "$TOKEN_RES" | tail -1)
BODY=$(echo "$TOKEN_RES" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "   Failed (HTTP $HTTP_CODE). Response: $BODY"
  exit 1
fi

REGISTRY_TOKEN=""
if command -v jq >/dev/null 2>&1; then
  REGISTRY_TOKEN=$(echo "$BODY" | jq -r '.token // empty')
fi
if [ -z "$REGISTRY_TOKEN" ]; then
  REGISTRY_TOKEN=$(echo "$BODY" | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
fi
if [ -z "$REGISTRY_TOKEN" ]; then
  echo "   Could not parse token from response."
  echo "   Response: $BODY"
  exit 1
fi
echo "   OK (got registry token)"

echo "2. Listing tags for ${OWNER}/${IMAGE}"
TAGS_RES=$(curl -s -w "\n%{http_code}" \
  "https://ghcr.io/v2/${OWNER}/${IMAGE}/tags/list" \
  -H "Authorization: Bearer ${REGISTRY_TOKEN}")

TAGS_HTTP=$(echo "$TAGS_RES" | tail -1)
TAGS_BODY=$(echo "$TAGS_RES" | sed '$d')

if [ "$TAGS_HTTP" != "200" ]; then
  echo "   Failed (HTTP $TAGS_HTTP). Response: $TAGS_BODY"
  exit 1
fi

echo "   OK"
if command -v jq >/dev/null 2>&1; then
  TAGS=$(echo "$TAGS_BODY" | jq -r '.tags[]?' 2>/dev/null | head -20)
  LATEST=$(echo "$TAGS_BODY" | jq -r '[.tags[]? | select(test("^[0-9]+\\.[0-9]+(\\.[0-9]+)?$"))] | sort_by(split(".") | map(tonumber)) | last' 2>/dev/null)
  echo "   Tags (sample): $TAGS"
  echo "   Latest version tag: ${LATEST:- (none matched)}"
else
  echo "   Raw tags list: ${TAGS_BODY:0:500}..."
fi

echo ""
echo "GHCR token is working. server-lens should now fill latest_version for GHCR containers."
