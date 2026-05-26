#!/usr/bin/env bash
# Kill any stale dev servers, then start `netlify dev` so the local
# environment mirrors prod: /api/* routes hit the Nitro server,
# /.netlify/functions/fetch-spa hits the standalone Chromium lambda,
# and netlify.toml headers/redirects are applied at the edge.
#
# Usage: pnpm start-dev-server

set -euo pipefail

NUXT_PORT="${NUXT_PORT:-3000}"
NETLIFY_PORT="${NETLIFY_PORT:-8888}"

cleanup_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "  Killing process(es) on port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

cleanup_pattern() {
  local pattern="$1"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "  Killing matching processes: $pattern"
    pkill -9 -f "$pattern" 2>/dev/null || true
  fi
}

echo "Cleaning up existing dev servers..."
cleanup_pattern "nuxt dev"
cleanup_pattern "netlify dev"
cleanup_pattern "vite"
cleanup_pattern "nitro"
cleanup_port "$NUXT_PORT"
cleanup_port "$NETLIFY_PORT"

# Brief settle so kernel releases ports before re-bind.
sleep 1

if ! command -v netlify >/dev/null 2>&1; then
  echo "Error: netlify CLI not found. Install with: pnpm add -g netlify-cli" >&2
  exit 1
fi

echo "Starting netlify dev (lambdas + edge headers match prod)..."
echo "  Nuxt:    http://localhost:${NUXT_PORT}"
echo "  Netlify: http://localhost:${NETLIFY_PORT}  <-- open this for prod-parity"
echo

exec netlify dev --port "$NETLIFY_PORT" --target-port "$NUXT_PORT"
