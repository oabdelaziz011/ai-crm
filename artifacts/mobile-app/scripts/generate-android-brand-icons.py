"""Place the official ValueOR mark into Android launcher, splash, and notification sizes."""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MARK_PATH = ROOT.parents[0] / "login-app" / "public" / "assets" / "images" / "logo-valueor-mark.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
ASSETS = ROOT / "assets"
CANVAS = (4, 28, 27, 255)
SCALES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def keyed_mark() -> Image.Image:
    mark = Image.open(MARK_PATH).convert("RGBA")
    pixels = mark.load()
    width, height = mark.size
    corners = [pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1]]
    opaque_black = all(pixel[3] > 250 and max(pixel[:3]) < 12 for pixel in corners)
    if opaque_black:
        for y in range(height):
            for x in range(width):
                red, green, blue, alpha = pixels[x, y]
                if max(red, green, blue) < 18:
                    pixels[x, y] = (red, green, blue, 0)
    return mark


def fit(mark: Image.Image, canvas: Image.Image, fraction: float) -> None:
    limit_w = max(1, int(canvas.width * fraction))
    limit_h = max(1, int(canvas.height * fraction))
    scale = min(limit_w / mark.width, limit_h / mark.height)
    resized = mark.resize((max(1, int(mark.width * scale)), max(1, int(mark.height * scale))), Image.Resampling.LANCZOS)
    canvas.alpha_composite(resized, ((canvas.width - resized.width) // 2, (canvas.height - resized.height) // 2))


def white_from(mark: Image.Image, size: int, fraction: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    limit = max(1, int(size * fraction))
    scale = min(limit / mark.width, limit / mark.height)
    resized = mark.resize((max(1, int(mark.width * scale)), max(1, int(mark.height * scale))), Image.Resampling.LANCZOS)
    alpha = resized.getchannel("A")
    white = Image.new("RGBA", resized.size, (255, 255, 255, 0))
    white.putalpha(alpha)
    canvas.alpha_composite(white, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def circle(image: Image.Image) -> Image.Image:
    rounded = image.convert("RGBA")
    mask = Image.new("L", rounded.size, 0)
    mask_pixels = mask.load()
    radius = min(rounded.size) / 2
    center_x = (rounded.width - 1) / 2
    center_y = (rounded.height - 1) / 2
    for y in range(rounded.height):
        for x in range(rounded.width):
            if (x - center_x) ** 2 + (y - center_y) ** 2 <= radius ** 2:
                mask_pixels[x, y] = 255
    rounded.putalpha(mask)
    return rounded


def main() -> None:
    mark = keyed_mark()
    for name, scale in SCALES.items():
        folder = RES / f"mipmap-{name}"
        folder.mkdir(parents=True, exist_ok=True)
        legacy = Image.new("RGBA", (int(48 * scale), int(48 * scale)), CANVAS)
        fit(mark, legacy, 0.72)
        legacy.convert("RGB").save(folder / "ic_launcher.png")
        circle(legacy).save(folder / "ic_launcher_round.png")
        for old in folder.glob("*.webp"):
            old.unlink()

        adaptive = int(108 * scale)
        foreground = Image.new("RGBA", (adaptive, adaptive), (0, 0, 0, 0))
        fit(mark, foreground, 66 / 108)
        foreground.save(folder / "ic_launcher_foreground.png")
        Image.new("RGB", (adaptive, adaptive), CANVAS[:3]).save(folder / "ic_launcher_background.png")
        white_from(mark, adaptive, 66 / 108).save(folder / "ic_launcher_monochrome.png")

        splash = Image.new("RGBA", (int(96 * scale), int(96 * scale)), (0, 0, 0, 0))
        fit(mark, splash, 0.92)
        drawable = RES / f"drawable-{name}"
        drawable.mkdir(parents=True, exist_ok=True)
        splash.save(drawable / "splashscreen_logo.png")
        white_from(mark, int(24 * scale), 0.82).save(drawable / "notification_icon.png")

    icon = Image.new("RGBA", (1024, 1024), CANVAS)
    fit(mark, icon, 0.72)
    icon.convert("RGB").save(ASSETS / "icon.png")
    foreground = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fit(mark, foreground, 66 / 108)
    foreground.save(ASSETS / "android-icon-foreground.png")
    Image.new("RGB", (1024, 1024), CANVAS[:3]).save(ASSETS / "android-icon-background.png")
    white_from(mark, 1024, 66 / 108).save(ASSETS / "android-icon-monochrome.png")
    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fit(mark, splash, 0.46)
    splash.save(ASSETS / "splash-icon.png")
    print(f"brand icons written from {mark.size[0]}x{mark.size[1]}")


if __name__ == "__main__":
    main()
