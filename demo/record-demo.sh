#!/usr/bin/env bash
#
# Rebuild atem-overseer's hosted demo end to end.
#
# Runs the server with its built-in `--mock` fleet, records what that backend
# actually serves — including a long stretch of the WebSocket telemetry that
# drives the meters, timecode and media-pool bars — then builds the real web app
# for the Pages base path and assembles the two together.
#
# Publish with:
#   demo/deploy-pages.sh --dist demo/dist --label "atem-overseer demo"
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=4712
BASE="http://127.0.0.1:$PORT"
# The ids in mockConfig(); the fleet is not listed by any GET endpoint (the
# dashboard learns it over the WebSocket), so the per-device reads are named.
DEVICES=(cam-a cam-b cam-c)

echo "==> Building libs"
npm run build:libs >/dev/null

echo "==> Starting the server with the mock fleet"
ATEM_OVERSEER_PORT=$PORT npx tsx packages/server/src/index.ts --mock \
  >/tmp/atem-overseer-demo-record.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  curl -sf "$BASE/api/discovery" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "$BASE/api/discovery" >/dev/null || {
  echo "error: server did not start; see /tmp/atem-overseer-demo-record.log" >&2; exit 1; }

GET_ARGS=(--get /api/discovery --get /api/external-apps)
for device in "${DEVICES[@]}"; do
  GET_ARGS+=(--get "/api/devices/$device/media" --get "/api/devices/$device/restreamer")
done

# 14s of telemetry: long enough that the meters move and the record timecode
# advances, rather than the dashboard sitting frozen on one snapshot.
echo "==> Recording"
node demo/record-fixtures.mjs \
  --base "$BASE" \
  --app "atem-overseer" --repo "https://github.com/stoatworks-labs/atem-overseer" \
  "${GET_ARGS[@]}" \
  --ws /ws --ws-seconds 14 \
  --out demo/demo-fixtures.json

echo "==> Building the web app for /atem-overseer/"
(cd packages/web && npx vite build --base=/atem-overseer/)

echo "==> Assembling the site"
demo/build-demo.sh \
  --src packages/web/dist \
  --fixtures demo/demo-fixtures.json \
  --out demo/dist \
  --base /atem-overseer/

echo
echo "Preview it exactly as Pages will serve it:"
echo "  demo/serve-demo.py --dir demo/dist --base /atem-overseer/"
