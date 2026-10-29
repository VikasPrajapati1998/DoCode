#!/usr/bin/env sh
#
# Copyright (c) Microsoft Corporation. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"

# Set rpath before changing the interpreter path
# Refs https://github.com/NixOS/patchelf/issues/524
if [ -n "$DOCODE_SERVER_CUSTOM_GLIBC_LINKER" ] && [ -n "$DOCODE_SERVER_CUSTOM_GLIBC_PATH" ] && [ -n "$DOCODE_SERVER_PATCHELF_PATH" ]; then
	echo "Patching glibc from $DOCODE_SERVER_CUSTOM_GLIBC_PATH with $DOCODE_SERVER_PATCHELF_PATH..."
	"$DOCODE_SERVER_PATCHELF_PATH" --set-rpath "$DOCODE_SERVER_CUSTOM_GLIBC_PATH" "$ROOT/node"
	echo "Patching linker from $DOCODE_SERVER_CUSTOM_GLIBC_LINKER with $DOCODE_SERVER_PATCHELF_PATH..."
	"$DOCODE_SERVER_PATCHELF_PATH" --set-interpreter "$DOCODE_SERVER_CUSTOM_GLIBC_LINKER" "$ROOT/node"
	echo "Patching complete."
fi

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"
