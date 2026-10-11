"""QR codes and Code 128 barcodes as SVG (pure Python, no Pillow / native deps)."""
from io import BytesIO
from xml.sax.saxutils import escape

import qrcode
import qrcode.image.svg


def qr_svg(data: str) -> str:
    img = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buf = BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")


# Code 128 bar/space widths for symbol values 0..106 (106 = STOP, 7 elements)
_C128 = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
]
START_B = 104


def code128_modules(data: str):
    """Code set B: all printable ASCII (part codes are letters/digits/-)."""
    vals = [START_B]
    for ch in data:
        o = ord(ch)
        if o < 32 or o > 126:
            raise ValueError(f"character not encodable in Code 128-B: {ch!r}")
        vals.append(o - 32)
    vals.append((START_B + sum(i * v for i, v in enumerate(vals[1:], start=1))) % 103)   # checksum
    vals.append(106)
    widths = "".join(_C128[v] for v in vals)
    return [int(w) for w in widths]          # alternating bar, space, bar, ...


def barcode_svg(data: str, height: int = 60, quiet: int = 10, text: bool = False) -> str:
    """Scalable Code 128 SVG: 1 module = 1 viewBox unit; the page sets the size."""
    mods = code128_modules(data)
    total = sum(mods) + 2 * quiet
    x, rects = quiet, []
    for i, w in enumerate(mods):
        if i % 2 == 0:
            rects.append(f'<rect x="{x}" y="0" width="{w}" height="{height}"/>')
        x += w
    h = height + (14 if text else 0)
    label = (f'<text x="{total / 2}" y="{height + 12}" font-family="monospace" font-size="11" '
             f'text-anchor="middle">{escape(data)}</text>') if text else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {h}" '
            f'preserveAspectRatio="none" shape-rendering="crispEdges">'
            f'<rect width="{total}" height="{h}" fill="#fff"/><g fill="#000">{"".join(rects)}</g>{label}</svg>')
