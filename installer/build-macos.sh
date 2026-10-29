#!/usr/bin/env bash
# Builds the macOS installers (.dmg, .zip) into installer/macos. Run on macOS only.
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

npm run gulp core-ci
npm run gulp "docode-darwin-${ARCH}-min-ci"

APP_DIR="../DoCode-darwin-${ARCH}"
mkdir -p installer/macos
hdiutil create -volname "DoCode" -srcfolder "${APP_DIR}/DoCode.app" -ov -format UDZO \
  "installer/macos/DoCode-darwin-${ARCH}.dmg"
ditto -c -k --keepParent "${APP_DIR}/DoCode.app" "installer/macos/DoCode-darwin-${ARCH}.zip"

echo "Done. Installers are in $(pwd)/installer/macos"
