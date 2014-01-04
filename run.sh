#!/bin/bash

cd "$(dirname "$0")"
installdir="$PWD"
cd "$OLDPWD"

/usr/bin/node "$installdir/core/main.js"
