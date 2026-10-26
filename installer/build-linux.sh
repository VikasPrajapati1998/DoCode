#!/usr/bin/env bash
# Builds the Linux installers (.deb, .rpm, .tar.gz) into installer/linux. Run on Linux only.
set -euo pipefail
cd "$(dirname "$0")/.."

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64) ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

npm run gulp core-ci
npm run gulp "vscode-linux-${ARCH}-min-ci"
npm run gulp "vscode-linux-${ARCH}-prepare-deb"
npm run gulp "vscode-linux-${ARCH}-build-deb"
npm run gulp "vscode-linux-${ARCH}-prepare-rpm"
npm run gulp "vscode-linux-${ARCH}-build-rpm"

mkdir -p installer/linux
find .build/linux -name '*.deb' -exec cp {} "installer/linux/DoCode-linux-${ARCH}.deb" \;
find .build/linux -name '*.rpm' -exec cp {} "installer/linux/DoCode-linux-${ARCH}.rpm" \;
tar -czf "installer/linux/DoCode-linux-${ARCH}.tar.gz" -C .. "VSCode-linux-${ARCH}"

echo "Done. Installers are in $(pwd)/installer/linux"
