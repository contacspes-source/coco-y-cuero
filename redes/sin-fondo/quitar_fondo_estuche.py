"""Quita el fondo blanco exterior de una foto (flood fill desde los bordes) y recorta al contenido."""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

def quitar(entrada, salida, umbral=240):
    img = Image.open(entrada).convert("RGB")
    a = np.asarray(img).astype(int)
    blanco = (a[..., 0] > umbral) & (a[..., 1] > umbral) & (a[..., 2] > umbral)
    etiquetas, _ = ndimage.label(blanco)
    bordes = set(np.unique(np.concatenate([etiquetas[0], etiquetas[-1], etiquetas[:, 0], etiquetas[:, -1]]))) - {0}
    fondo = np.isin(etiquetas, list(bordes))
    fondo = ndimage.binary_dilation(fondo, iterations=1) & blanco | fondo
    alfa = np.where(fondo, 0, 255).astype(np.uint8)
    alfa = np.asarray(Image.fromarray(alfa).filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(0.8)))
    out = np.dstack([a.astype(np.uint8), alfa])
    im = Image.fromarray(out, "RGBA")
    im = im.crop(im.getbbox())
    im.save(salida)
    print(salida, im.size)

if __name__ == "__main__":
    quitar(sys.argv[1], sys.argv[2])
