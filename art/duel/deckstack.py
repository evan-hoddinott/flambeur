"""Compose a patterned card and two paper-edge sprites in table perspective."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
NEAREST = Image.Resampling.NEAREST


def paper_edge(texture, width, height, scale):
    """Repeat the paper stock at its physical scale as the pile grows."""
    strip = texture.resize((width, max(1, round(texture.height * scale))), NEAREST)
    face = Image.new("RGBA", (width, height))
    for y in range(0, height, strip.height):
        face.paste(strip, (0, y))
    return face


def deck_stack(parts, back_image, count, scale):
    """Return a bottom-center anchored stack, with the right and front edges exposed."""
    if count <= 0:
        return Image.new("RGBA", (1, 1))
    if scale <= 0:
        raise ValueError("Deck scale must be positive")

    front = max(1, round(49 * scale))
    depth = max(1, round(46 * scale))
    lean = max(1, round(15 * scale))
    height = max(1, round((count - 1) * scale / 2)) if count > 1 else 0
    size = (front + lean, depth + height)
    image = Image.new("RGBA", size)

    if height:
        end = paper_edge(parts["pile/stack"], front, height, scale)
        side = paper_edge(parts["pile/side"], lean, height, scale)
        # At the right edge of the pack, the paper lines recede with the long edge.
        side_plane = side.transform(
            size, Image.Transform.AFFINE,
            (1, 0, -front, depth / lean, 1, -depth - (front * depth / lean)),
            NEAREST,
        )
        image.alpha_composite(side_plane)
        image.alpha_composite(end, (0, depth))

    # Inverse-map the top parallelogram to the original, unrotated card back.
    w, h = back_image.size
    top = back_image.convert("RGBA").transform(
        size, Image.Transform.AFFINE,
        (w / front, w * lean / (front * depth), -w * lean / front,
         0, h / depth, 0),
        NEAREST,
    )
    image.alpha_composite(top)
    return image


def stack_review(parts):
    """Show all seven stock backs at the same 24-card count on the green felt."""
    from review import card_image

    boxes = [
        ("classic", "Classic"), ("forge", "Flambé"), ("suited", "Suited"),
        ("highroller", "High Roller"), ("bargain", "Bargain Bin"),
        ("collector", "Collector"), ("standard", "Standard"),
    ]
    sheet = Image.new("RGBA", (len(boxes) * 84, 84))
    felt = parts["felt/green"]
    for y in range(0, sheet.height, felt.height):
        for x in range(0, sheet.width, felt.width):
            sheet.paste(felt, (x, y))
    labels = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=10)
    for column, (box, label) in enumerate(boxes):
        stack = deck_stack(parts, card_image("backs/" + box), 24, 1)
        x = column * 84 + 42
        sheet.alpha_composite(stack, (x - stack.width // 2, 61 - stack.height))
        labels.text((x, 66), label, font=font, fill="#f6ecd2", anchor="mt")
    sheet.resize((sheet.width * 2, sheet.height * 2), NEAREST).save(ROOT / "deck-stacks.png")
