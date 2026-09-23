"""Pure-Python QR label generation as inline SVG (no Pillow / native deps)."""
import qrcode
import qrcode.image.svg


def qr_svg(data: str) -> str:
    img = qrcode.make(data, image_factory=qrcode.image.svg.SvgPathImage,
                      box_size=10, border=2)
    from io import BytesIO
    buf = BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")
