"""One-shot script: convert the brand species/hunt-style PNGs from
flat RGB-on-white into proper RGBA with transparent backgrounds.

The source PNGs ship with white backgrounds baked in (mode='RGB',
no alpha channel) so when rendered against the dark card background
in the app they show as opaque white squares around each silhouette.

We use the GOLD variants as the master shape — they have a clear
high-contrast silhouette on a near-white background. From each gold
master we derive:
  * <name>-gold.png — gold silhouette, transparent background
  * <name>-white.png — same silhouette recolored pure white,
    transparent background

The original *-white.png files are NOT used to derive the shape
because their silhouettes are near-white on a white background and
have no usable luminance contrast.

Run with:
    cd /app/frontend/assets/icons/species
    python3 _make_transparent.py

Idempotent — safe to re-run; re-reads the gold masters every time.
"""

from __future__ import annotations

import os
from PIL import Image

ASSET_DIR = os.path.dirname(os.path.abspath(__file__))

# Pixels brighter than this on the gold image are considered background
# and made fully transparent. The remaining pixels' alpha is scaled by
# how dark they are (i.e. how strongly inside the silhouette they fall),
# which gives a soft anti-aliased edge.
BG_LUMA_THRESHOLD = 235      # 0..255
EDGE_LUMA_FLOOR = 90         # below this is fully opaque


def luma(r: int, g: int, b: int) -> int:
    """Approximate perceived brightness in 0..255."""
    return int(0.299 * r + 0.587 * g + 0.114 * b)


def alpha_from_luma(L: int) -> int:
    """Pixel alpha based on luminance.

    * Brighter than threshold → 0  (background, fully transparent)
    * Darker than floor       → 255 (silhouette body, fully opaque)
    * In between              → linear ramp (anti-aliased edge)
    """
    if L >= BG_LUMA_THRESHOLD:
        return 0
    if L <= EDGE_LUMA_FLOOR:
        return 255
    span = BG_LUMA_THRESHOLD - EDGE_LUMA_FLOOR
    return int(round((BG_LUMA_THRESHOLD - L) * 255 / span))


def make_pair_from_gold(gold_path: str) -> tuple[Image.Image, Image.Image]:
    """Build the (gold_rgba, white_rgba) pair for one master gold image."""
    src = Image.open(gold_path).convert("RGB")
    w, h = src.size
    src_px = src.load()

    gold = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    white = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    g_px = gold.load()
    wt_px = white.load()

    for y in range(h):
        for x in range(w):
            r, g, b = src_px[x, y]
            a = alpha_from_luma(luma(r, g, b))
            if a == 0:
                continue
            # Gold variant: keep the original gold colour, with computed alpha.
            g_px[x, y] = (r, g, b, a)
            # White variant: recolour the same shape pure white.
            wt_px[x, y] = (255, 255, 255, a)
    return gold, white


def main() -> None:
    files = sorted(os.listdir(ASSET_DIR))
    gold_files = [f for f in files if f.endswith("-gold.png")]
    if not gold_files:
        print("No *-gold.png files found.")
        return

    converted = 0
    for gold_name in gold_files:
        base = gold_name[: -len("-gold.png")]
        white_name = f"{base}-white.png"
        gold_path = os.path.join(ASSET_DIR, gold_name)
        white_path = os.path.join(ASSET_DIR, white_name)

        gold_img, white_img = make_pair_from_gold(gold_path)
        gold_img.save(gold_path, "PNG", optimize=True)
        white_img.save(white_path, "PNG", optimize=True)
        converted += 1
        print(f"  converted: {base} → ({gold_name}, {white_name})")

    print(f"\nDone. {converted} pair(s) re-saved with transparent backgrounds.")


if __name__ == "__main__":
    main()
