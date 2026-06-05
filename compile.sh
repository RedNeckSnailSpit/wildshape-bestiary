#!/usr/bin/env bash
# compile.sh — Wildshape Bestiary
# Bumps the patch version, rebuilds the dist zip and manifest.
# Usage: ./compile.sh

set -e

MODULE_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$MODULE_DIR/module.json"
DIST_DIR="$MODULE_DIR/dist"
ZIP_NAME="wildshape-bestiary.zip"
BASE_URL="https://rednecksnailspit.co.za/foundry/modules/wildshape-bestiary"

# ── Read current version ──────────────────────────────────────────────────────
CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('$MANIFEST'))['version'])")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

echo "Bumping version: ${CURRENT_VERSION} → ${NEW_VERSION}"

# ── Update version in module.json ─────────────────────────────────────────────
python3 - <<PYEOF
import json

with open("$MANIFEST", "r") as f:
    data = json.load(f)

data["version"]  = "$NEW_VERSION"
data["download"] = "$BASE_URL/dist/$ZIP_NAME"

with open("$MANIFEST", "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PYEOF

echo "module.json updated."

# ── Rebuild dist/ ─────────────────────────────────────────────────────────────
mkdir -p "$DIST_DIR"

# Remove old zip
rm -f "$DIST_DIR/$ZIP_NAME"

# Copy updated manifest into dist
cp "$MANIFEST" "$DIST_DIR/module.json"

# Build zip from module root (exclude dist/ and compile.sh itself)
cd "$MODULE_DIR"
zip -r "$DIST_DIR/$ZIP_NAME" . \
  --exclude "*/dist/*" \
  --exclude "./compile.sh" \
  --exclude "*/.git/*" \
  --exclude "*/__pycache__/*" \
  --exclude "*.DS_Store"

echo "Created: dist/$ZIP_NAME"
echo "Done. Install via: $BASE_URL/dist/module.json"
