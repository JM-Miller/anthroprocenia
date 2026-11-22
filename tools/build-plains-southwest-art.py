"""Draw original white icons for Lakhota and Navajo; preserve their AI scene art."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "anthroprocenia" / "art" / "civilizations"
WHITE = (255, 255, 255, 255)


def icon(key, subject, tier=0):
    image = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    if subject == "tipi":
        draw.line([(150, 390), (260, 115), (370, 390), (150, 390)], fill=WHITE, width=14)
        draw.line([(238, 172), (220, 90)], fill=WHITE, width=10)
        draw.line([(278, 172), (298, 85)], fill=WHITE, width=10)
        draw.line([(232, 390), (250, 310), (275, 390)], fill=WHITE, width=10)
    elif subject == "hogan":
        draw.line([(100, 270), (180, 155), (340, 155), (410, 270), (390, 385),
                   (125, 385), (100, 270)], fill=WHITE, width=16)
        draw.line([(100, 270), (410, 270)], fill=WHITE, width=10)
        draw.rectangle((235, 285, 295, 385), outline=WHITE, width=10)
    elif subject == "loom":
        draw.rectangle((140, 100, 380, 405), outline=WHITE, width=14)
        for x in range(165, 365, 25):
            draw.line([(x, 130), (x, 370)], fill=WHITE, width=5)
        for y in range(160, 350, 35):
            draw.line([(150, y), (365, y + 18)], fill=WHITE, width=8)
    elif subject == "hide":
        draw.line([(180, 130), (235, 165), (300, 135), (350, 210), (320, 270),
                   (355, 360), (285, 390), (235, 355), (160, 370), (130, 300),
                   (165, 230), (145, 175), (180, 130)], fill=WHITE, width=14)
        draw.line([(215, 215), (290, 305)], fill=WHITE, width=8)
    elif subject == "bow":
        draw.arc((140 - tier * 9, 90, 370, 410), 270, 90, fill=WHITE, width=14 + tier * 2)
        draw.line([(255, 90), (255, 410)], fill=WHITE, width=6)
        draw.line([(125, 250 + tier * 12), (400, 250 + tier * 12)], fill=WHITE, width=8)
        draw.line([(370, 228 + tier * 12), (400, 250 + tier * 12),
                   (370, 272 + tier * 12)], fill=WHITE, width=10)
    elif subject == "horse":
        draw.line([(120, 255), (145, 195), (270, 195), (315, 110), (355, 125),
                   (395, 185), (350, 215), (320, 190), (305, 295), (280, 370),
                   (258, 370), (270, 290), (195, 280), (170, 365), (145, 365),
                   (155, 280)], fill=WHITE, width=15)
        draw.line([(135, 225), (95, 300)], fill=WHITE, width=12)
        for i in range(tier):
            draw.line([(195 + i * 25, 145), (195 + i * 25, 175)], fill=WHITE, width=9)
    elif subject == "path":
        route = [(155, 410), (270, 320), (220, 230), (340, 120)]
        if "NAVAJO" in key:
            route = [(125, 410), (310, 330), (175, 225), (360, 130)]
        draw.line(route, fill=WHITE, width=16)
        draw.line([(130, 200), (185, 145), (240, 200)], fill=WHITE, width=12)
        draw.ellipse((305, 78, 355, 128), outline=WHITE, width=10)
    elif subject == "garden":
        for y in (275, 325, 375):
            draw.line([(110, y), (390, y - 15)], fill=WHITE, width=12)
        draw.line([(245, 300), (245, 130)], fill=WHITE, width=10)
        draw.line([(245, 210), (175, 160), (245, 185), (310, 135)], fill=WHITE, width=12)
    elif subject == "mesa":
        draw.line([(95, 380), (155, 205), (190, 205), (205, 150), (330, 150),
                   (345, 240), (385, 240), (420, 380)], fill=WHITE, width=16)
        draw.line([(165, 265), (350, 265)], fill=WHITE, width=8)
        draw.line([(145, 325), (385, 325)], fill=WHITE, width=8)
    else:
        raise ValueError(subject)
    if tier:
        draw.arc((65 + tier * 7, 65, 450, 440 - tier * 9), 15, 140 + tier * 8, fill=WHITE, width=6 + tier)
    path = ROOT / (key.lower() + ".png" if key in ("LAKHOTA", "NAVAJO") else "icons/" + key.lower() + ".png")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


if __name__ == "__main__":
    for key, subjects in {
        "LAKHOTA": ["horse", "tipi", "hide", "tipi", "path", "horse"],
        "NAVAJO": ["mesa", "hogan", "loom", "hogan", "garden", "bow"],
    }.items():
        icon(key, subjects[0])
        icon(f"BUILDING_ANTHRO_{key}_1", subjects[1])
        icon(f"BUILDING_ANTHRO_{key}_2", subjects[2])
        icon(f"QUARTER_ANTHRO_{key}", subjects[3], 1)
        icon(f"IMPROVEMENT_ANTHRO_{key}", subjects[4], 2)
        for tier in range(1, 4):
            icon(f"UNIT_ANTHRO_{key}_{tier}", subjects[5], tier)
        icon(f"UNIT_ANTHRO_{key}_4", "path", 4)
