#!/bin/bash
# Fetches the chess engines bundled into the desktop app (not stored in git):
#   - lc0 (Leela Chess Zero), which runs the Maia networks. Needs: brew install lc0
#   - Maia 1100–1900: human-like networks trained on Lichess games (GPL-3.0, CSSLab/maia-chess)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p engines/maia

LC0="$(brew --prefix lc0 2>/dev/null)/libexec/lc0"
[ -x "$LC0" ] || { echo "lc0 not found. Run: brew install lc0"; exit 1; }
cp "$LC0" engines/lc0
echo "lc0: $(engines/lc0 --help 2>&1 | grep -o 'v[0-9.]*' | head -1)"

for elo in 1100 1200 1300 1400 1500 1600 1700 1800 1900; do
  f="engines/maia/maia-$elo.pb.gz"
  [ -s "$f" ] || curl -fsSL -o "$f" "https://raw.githubusercontent.com/CSSLab/maia-chess/master/maia_weights/maia-$elo.pb.gz"
done
ls -la engines/maia
