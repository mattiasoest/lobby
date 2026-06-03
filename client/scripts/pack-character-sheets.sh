#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHAR="$ROOT/src/assets/character"

magick \
  "$CHAR/default/idle.png" \
  "$CHAR/option1/idle.png" \
  "$CHAR/option2/idle.png" \
  "$CHAR/option3/idle.png" \
  +append \
  "$CHAR/characters_idle.png"

magick \
  "$CHAR/default/walk.png" \
  "$CHAR/option1/walk.png" \
  "$CHAR/option2/walk.png" \
  "$CHAR/option3/walk.png" \
  +append \
  "$CHAR/characters_walk.png"

echo "Wrote characters_idle.png and characters_walk.png"
