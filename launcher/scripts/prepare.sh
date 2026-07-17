#!/usr/bin/env bash
# Assemble the embedded Atem Overseer app for the desktop bundle.
#
# Atem Overseer's server pulls native addons (atem-connection + node-media-server
# both depend on @julusian/freetype2), which cannot be inlined into a single-file
# bundle. So instead of esbuild we ship the compiled server `dist` plus a
# production `node_modules` carrying this platform's native prebuilds, laid out
# mirroring packages/{server,web}/dist so the server's import.meta.url-relative
# paths (../../web/dist) resolve unchanged. Node resolves the app's deps from the
# hoisted atem-overseer-app/node_modules.
#
# Produces src-tauri/node[.exe] and src-tauri/atem-overseer-app/ (both
# git-ignored; they ship inside the bundle). Run before `npm run tauri build`.
# Must run on the TARGET platform (native prebuilds are platform-specific); the
# release matrix does exactly that.
#
# NODE_PLATFORM overrides the embedded runtime arch (win-x64 / darwin-arm64 /
# darwin-x64 / linux-x64 / linux-arm64); defaults to the host.
set -euo pipefail

NODE_VERSION="v22.20.0"

detect_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="win" ;;
    *) os="linux" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) arch="x64" ;;
  esac
  echo "${os}-${arch}"
}

PLATFORM="${NODE_PLATFORM:-$(detect_platform)}"

HERE="$(cd "$(dirname "$0")/.." && pwd)"     # launcher/
REPO="$(cd "$HERE/.." && pwd)"               # atem-overseer repo root
TAURI="$HERE/src-tauri"
APP="$TAURI/atem-overseer-app"

echo "==> building Atem Overseer"
( cd "$REPO" && npm install && npm run build )

echo "==> staging server dist + web dist"
rm -rf "$APP"
mkdir -p "$APP/packages/server" "$APP/packages/web"
cp -R "$REPO/packages/server/dist" "$APP/packages/server/dist"
cp "$REPO/packages/server/package.json" "$APP/packages/server/package.json"
cp -R "$REPO/packages/web/dist" "$APP/packages/web/dist"

echo "==> installing production node_modules (with native prebuilds for $PLATFORM)"
# A minimal top-level manifest whose deps are the server's runtime deps, so a
# single hoisted node_modules serves the app.
node -e '
  const fs = require("fs");
  const pkg = require(process.argv[1]);
  fs.writeFileSync(process.argv[2], JSON.stringify({
    name: "atem-overseer-app",
    private: true,
    type: "module",
    dependencies: pkg.dependencies || {}
  }, null, 2));
' "$REPO/packages/server/package.json" "$APP/package.json"
( cd "$APP" && npm install --omit=dev --no-audit --no-fund )

echo "==> fetching self-contained Node $NODE_VERSION ($PLATFORM)"
if [[ "$PLATFORM" == win-* ]]; then
  TARBALL="node-$NODE_VERSION-$PLATFORM"
  curl -sL "https://nodejs.org/dist/$NODE_VERSION/$TARBALL.zip" -o "$TAURI/node.zip"
  ( cd "$TAURI"
    if command -v unzip >/dev/null 2>&1; then unzip -q -o node.zip
    elif command -v 7z >/dev/null 2>&1; then 7z x -y node.zip >/dev/null
    else tar -xf node.zip; fi )
  cp "$TAURI/$TARBALL/node.exe" "$TAURI/node.exe"
  rm -rf "$TAURI/$TARBALL" "$TAURI/node.zip"
  echo "prepared: $TAURI/node.exe + $APP"
else
  TARBALL="node-$NODE_VERSION-$PLATFORM"
  curl -sL "https://nodejs.org/dist/$NODE_VERSION/$TARBALL.tar.gz" -o "$TAURI/node.tar.gz"
  tar xzf "$TAURI/node.tar.gz" -C "$TAURI"
  cp "$TAURI/$TARBALL/bin/node" "$TAURI/node"
  chmod +x "$TAURI/node"
  rm -rf "$TAURI/$TARBALL" "$TAURI/node.tar.gz"
  echo "prepared: $TAURI/node + $APP (server dist, web UI, prod node_modules)"
fi
