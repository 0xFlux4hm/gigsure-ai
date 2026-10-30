"""
Overlay "GigSure AI" brand text onto the generated thumbnails.
Uses PIL (Python Imaging Library).
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

THUMBS_DIR = Path("/home/z/my-project/download/gigsure-thumbnails")
FONT_PATHS = [
    "/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

def find_font(size: int) -> ImageFont.FreeTypeFont:
    for p in FONT_PATHS:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def add_brand_overlay(src_path: Path, dst_path: Path, brand_text: str = "GigSure AI") -> None:
    img = Image.open(src_path).convert("RGBA")
    W, H = img.size

    # Add a subtle dark gradient at the bottom for text legibility
    gradient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gradient)
    band_height = int(H * 0.35)
    for y in range(band_height):
        # Gradient from transparent at top to semi-opaque dark at bottom
        alpha = int((y / band_height) ** 1.5 * 180)
        gd.line([(0, H - band_height + y), (W, H - band_height + y)], fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img, gradient)

    # Add brand text
    draw = ImageDraw.Draw(img)
    font_size = int(H * 0.13)  # 13% of image height
    font = find_font(font_size)

    # Compute text bbox
    try:
        bbox = draw.textbbox((0, 0), brand_text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:
        # Older Pillow fallback
        text_w, text_h = draw.textsize(brand_text, font=font)

    # Position: bottom-left with padding
    padding = int(H * 0.06)
    x = padding
    y = H - text_h - padding - int(H * 0.04)

    # Draw subtle text shadow for legibility
    shadow_offset = max(2, font_size // 30)
    draw.text((x + shadow_offset, y + shadow_offset), brand_text, font=font, fill=(0, 0, 0, 180))
    # Draw main text in white
    draw.text((x, y), brand_text, font=font, fill=(255, 255, 255, 255))

    # Add subtle accent color dot next to brand — emerald green
    dot_radius = int(font_size * 0.18)
    dot_x = x + text_w + padding // 2 + dot_radius
    dot_y = y + text_h // 2
    draw.ellipse(
        [(dot_x - dot_radius, dot_y - dot_radius), (dot_x + dot_radius, dot_y + dot_radius)],
        fill=(16, 185, 129, 255),  # emerald-500
    )

    img.convert("RGB").save(dst_path, "PNG", optimize=True)
    print(f"✓ {dst_path.name}  ({dst_path.stat().st_size // 1024} KB)")

def main():
    sources = sorted(THUMBS_DIR.glob("thumbnail-*.png"))
    sources = [s for s in sources if "-branded" not in s.name]
    print(f"Branding {len(sources)} thumbnails...")
    for src in sources:
        dst = src.with_name(src.stem + "-branded.png")
        add_brand_overlay(src, dst)
    print("\nDone. Branded versions saved alongside originals.")

if __name__ == "__main__":
    main()
