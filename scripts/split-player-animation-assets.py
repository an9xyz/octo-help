#!/usr/bin/env python3
"""Split the existing player watermarks into reusable player and ball layers."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "player-animation"

PLAYERS = {
    "messi": PUBLIC / "messi-watermark.png",
    "mbappe": PUBLIC / "mbappe-watermark.png",
}

EXTRA_PLAYER_ERASE_BOXES = {
    "mbappe": [(325, 820, 410, 900)],
}

ALPHA_COMPONENT_MIN_PIXELS = 10
BALL_FRAME_SIZE = 160
BALL_FRAME_COUNT = 8


def alpha_components(image: Image.Image) -> list[dict[str, object]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = image.size
    seen = bytearray(width * height)
    components: list[dict[str, object]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] == 0:
                continue

            seen[index] = 1
            queue = deque([(x, y)])
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y

            while queue:
                current_x, current_y = queue.pop()
                points.append((current_x, current_y))
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)

                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if seen[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    seen[next_index] = 1
                    queue.append((next_x, next_y))

            if len(points) >= ALPHA_COMPONENT_MIN_PIXELS:
                components.append(
                    {
                        "points": points,
                        "area": len(points),
                        "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                    }
                )

    components.sort(key=lambda component: int(component["area"]), reverse=True)
    return components


def render_component(source: Image.Image, points: list[tuple[int, int]]) -> Image.Image:
    layer = Image.new("RGBA", source.size, (0, 0, 0, 0))
    source_pixels = source.load()
    layer_pixels = layer.load()
    for x, y in points:
        layer_pixels[x, y] = source_pixels[x, y]
    return layer


def isolate_round_ball(image: Image.Image) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError("Cannot isolate an empty ball")
    left, top, right, bottom = bbox
    diameter = min(right - left, bottom - top)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    circle_bbox = (
        round(center_x - diameter / 2),
        round(center_y - diameter / 2),
        round(center_x + diameter / 2),
        round(center_y + diameter / 2),
    )

    scale = 4
    mask = Image.new("L", (image.width * scale, image.height * scale), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(tuple(value * scale for value in circle_bbox), fill=255)
    mask = mask.resize(image.size, Image.Resampling.LANCZOS)

    isolated = image.copy()
    isolated.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return isolated


def fit_on_square(image: Image.Image, size: int) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise ValueError("Cannot fit an empty image")
    cropped = image.crop(bbox)
    usable = size - 20
    scale = min(usable / cropped.width, usable / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    square.alpha_composite(
        resized,
        ((size - resized.width) // 2, (size - resized.height) // 2),
    )
    return square


def make_spin_strip(ball: Image.Image) -> Image.Image:
    strip = Image.new(
        "RGBA",
        (BALL_FRAME_SIZE * BALL_FRAME_COUNT, BALL_FRAME_SIZE),
        (0, 0, 0, 0),
    )
    for frame in range(BALL_FRAME_COUNT):
        angle = -(360 / BALL_FRAME_COUNT) * frame
        rotated = ball.rotate(angle, resample=Image.Resampling.BICUBIC)
        strip.alpha_composite(rotated, (frame * BALL_FRAME_SIZE, 0))
    return strip


def split_player(player_id: str, source_path: Path) -> dict[str, object]:
    source = Image.open(source_path).convert("RGBA")
    components = alpha_components(source)
    if len(components) < 2:
        raise RuntimeError(f"Expected separate player and ball components in {source_path}")

    player_component = components[0]
    ball_component = components[1]
    player_points = set(player_component["points"])
    ball_points = ball_component["points"]
    ball_bbox = ball_component["bbox"]

    # Preserve every original pixel except the detached ball and tiny kick debris
    # around it. This retains antialiased details that may form tiny components.
    player_layer = source.copy()
    player_pixels = player_layer.load()
    left, top, right, bottom = ball_bbox
    debris_margin = 60
    erase_left = max(0, left - debris_margin)
    erase_top = max(0, top - debris_margin)
    erase_right = min(source.width, right + debris_margin)
    erase_bottom = min(source.height, bottom + debris_margin)
    for y in range(erase_top, erase_bottom):
        for x in range(erase_left, erase_right):
            if (x, y) not in player_points:
                player_pixels[x, y] = (0, 0, 0, 0)

    for box in EXTRA_PLAYER_ERASE_BOXES.get(player_id, []):
        box_left, box_top, box_right, box_bottom = box
        for y in range(box_top, box_bottom):
            for x in range(box_left, box_right):
                player_pixels[x, y] = (0, 0, 0, 0)

    ball_layer = isolate_round_ball(render_component(source, ball_points))
    ball_square = fit_on_square(ball_layer, BALL_FRAME_SIZE)
    ball_center = {
        "x": round((left + right) / 2, 2),
        "y": round((top + bottom) / 2, 2),
    }

    player_path = OUTPUT / f"{player_id}-player.png"
    ball_path = OUTPUT / f"{player_id}-ball.png"
    strip_path = OUTPUT / f"{player_id}-ball-spin-strip.png"
    player_layer.save(player_path, optimize=True)
    ball_square.save(ball_path, optimize=True)
    make_spin_strip(ball_square).save(strip_path, optimize=True)

    return {
        "source": f"/{source_path.name}",
        "player": f"/player-animation/{player_path.name}",
        "ball": f"/player-animation/{ball_path.name}",
        "ballSpinStrip": f"/player-animation/{strip_path.name}",
        "canvas": {"width": source.width, "height": source.height},
        "ballSourceBox": {
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
        },
        "ballCenter": ball_center,
        "ballCenterNormalized": {
            "x": round(ball_center["x"] / source.width, 6),
            "y": round(ball_center["y"] / source.height, 6),
        },
        "spinFrames": BALL_FRAME_COUNT,
        "spinFrameSize": BALL_FRAME_SIZE,
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1,
        "players": {
            player_id: split_player(player_id, source_path)
            for player_id, source_path in PLAYERS.items()
        },
    }
    (OUTPUT / "assets.json").write_text(
        json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
