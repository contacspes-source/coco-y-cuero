import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.int16)
# "whiteness": distance from pure white
dist = 255 - a.min(axis=2)            # 0 = white
spread = a.max(axis=2) - a.min(axis=2) # low = gray/neutral
near_white = (dist < 28) & (spread < 22)
# background = near-white regions connected to the border
lab, n = ndimage.label(near_white)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:,0], lab[:,-1]]))) - {0}
bg = np.isin(lab, list(border))
# fill small holes inside the object so highlights stay opaque
bg = ndimage.binary_opening(bg, iterations=1)
alpha = np.where(bg, 0, 255).astype(np.uint8)
# soft edge: feather 1.2px
alpha_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert("RGBA"); out.putalpha(alpha_img)
bbox = Image.fromarray(alpha).getbbox()
if bbox:
    pad = 8
    x0,y0,x1,y1 = bbox
    out = out.crop((max(0,x0-pad), max(0,y0-pad), min(im.width,x1+pad), min(im.height,y1+pad)))
out.save(dst)
print(dst, out.size, "bg%%=%.0f" % (bg.mean()*100))
