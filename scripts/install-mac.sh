#!/bin/bash
# Build Chess Lab, install it to /Applications, and remove the build copy
# so Spotlight only ever finds one Chess Lab.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run dist:mac
osascript -e 'quit app "Chess Lab"' 2>/dev/null || true
sleep 1
rm -rf "/Applications/Chess Lab.app"
ditto "release/mac-arm64/Chess Lab.app" "/Applications/Chess Lab.app"
rm -rf release
echo "Installed /Applications/Chess Lab.app"
