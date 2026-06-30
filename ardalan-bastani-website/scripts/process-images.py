#!/usr/bin/env python3
"""
Turn the original photos in assets/img/originals/ into the cohesive graphic set
used by the site: cleaned full-colour versions, ink->gold duotones, and one
halftone screen-print poster. Re-run after swapping in new source photos.

    pip install Pillow numpy
    python3 scripts/process-images.py
"""
from PIL import Image, ImageOps, ImageEnhance
import numpy as np, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG  = os.path.join(HERE, "assets", "img")
ORIG = os.path.join(IMG, "originals")

INK=(11,10,13); RUST=(122,55,42); GOLD=(233,197,135); PAPER=(238,232,222)
DUO=[(0.0,INK),(0.45,(60,38,40)),(0.72,RUST),(1.0,GOLD)]

# slug -> (file, contrast, brightness, left%, top%, right%, bottom%)
JOBS = {
 "march":  ("march.webp",  1.10,1.02, .065,0,1.0,.952),
 "room":   ("room.webp",   1.08,1.00, 0,0,1.0,1.0),
 "evening":("evening.webp",1.12,1.04, 0,0,1.0,1.0),
 "gaze":   ("gaze.webp",   1.10,1.00, .035,0,1.0,1.0),
 "red":    ("red.webp",    1.12,1.02, 0,0,1.0,1.0),
}
HERO = "red"      # source for the WebGL relief texture
POSTER = "gaze"   # source for the halftone poster

def load(f, box):
    im = ImageOps.exif_transpose(Image.open(os.path.join(ORIG, f)).convert("RGB"))
    W,H = im.size; l,t,r,b = box
    return im.crop((int(W*l), int(H*t), int(W*r), int(H*b)))

def duotone(im, contrast=1.12, bright=1.0):
    g = ImageOps.autocontrast(ImageEnhance.Brightness(
        ImageEnhance.Contrast(ImageOps.grayscale(im)).enhance(contrast)).enhance(bright), cutoff=1)
    xs=[s[0] for s in DUO]; cs=[s[1] for s in DUO]; lut=np.zeros((256,3),np.uint8)
    for i in range(256):
        t=i/255
        for k in range(len(xs)-1):
            if xs[k]<=t<=xs[k+1]:
                f=(t-xs[k])/((xs[k+1]-xs[k]) or 1)
                lut[i]=[int(cs[k][j]+(cs[k+1][j]-cs[k][j])*f) for j in range(3)]; break
        else: lut[i]=cs[-1]
    return Image.fromarray(lut[np.asarray(g)], "RGB")

def halftone(im, cell=6):
    g = ImageOps.autocontrast(ImageEnhance.Contrast(ImageOps.grayscale(im)).enhance(1.18), cutoff=1)
    a = np.asarray(g).astype(np.float32)/255.0; H,W=a.shape
    yy,xx = np.mgrid[0:H,0:W]
    cx=(xx%cell)-cell/2+0.5; cy=(yy%cell)-cell/2+0.5
    ink = ((np.sqrt(cx*cx+cy*cy)/(cell*0.72)) > a).astype(np.float32)
    out = (np.array(PAPER)*(1-ink[...,None]) + np.array(INK)*ink[...,None]).astype(np.uint8)
    return Image.fromarray(out, "RGB")

def save(im, name, w, q=82):
    if im.width > w: im = im.resize((w, int(im.height*w/im.width)), Image.LANCZOS)
    im.save(os.path.join(IMG, name), quality=q, method=6)
    print("  ->", name, im.size)

for slug,(f,c,b,*box) in JOBS.items():
    im = load(f, box)
    save(im, f"{slug}-color.webp", 1300)
    save(duotone(im, c, b), f"{slug}-duo.webp", 1200)
    if slug == HERO:
        save(im, "hero-color.webp", 1200, q=86)
        save(duotone(im, c, b), "hero-duo.webp", 1200, q=86)
    if slug == POSTER:
        save(halftone(load(f, box).resize((760, int(load(f,box).height*760/load(f,box).width)),
             Image.LANCZOS)), "gaze-halftone.webp", 760)
print("done")
