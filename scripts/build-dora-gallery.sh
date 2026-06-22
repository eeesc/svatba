#!/usr/bin/env bash
# Regenerate thumbs + manifest after adding photos to fotky-dory/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fotky-dory"
THUMBS="$SRC/thumbs"
MANIFEST="$ROOT/js/dora-manifest.json"
MAX_WIDTH=900

mkdir -p "$THUMBS"

shopt -s nullglob
files=("$SRC"/*.{JPG,jpg,jpeg,JPEG})
IFS=$'\n' files=($(printf '%s\n' "${files[@]}" | sort -f))
unset IFS

for f in "${files[@]}"; do
  base="$(basename "$f")"
  out="$THUMBS/$base"
  if [[ ! -f "$out" || "$f" -nt "$out" ]]; then
    sips -Z "$MAX_WIDTH" "$f" --out "$out" >/dev/null
    if command -v magick >/dev/null; then
      magick "$out" -fuzz 4% -trim +repage "$out"
    fi
    echo "thumb: $base"
  fi
done

cd "$ROOT"
python3 - <<'PY'
import json, pathlib
src = pathlib.Path("fotky-dory")
files = sorted(
    [p.name for p in src.iterdir() if p.suffix.lower() in {".jpg", ".jpeg"} and p.is_file()],
    key=str.casefold,
)
pathlib.Path("js/dora-manifest.json").write_text(json.dumps(files, ensure_ascii=False) + "\n")
print(f"manifest: {len(files)} photos")
PY

echo "Done."
