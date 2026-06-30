# Images

The five real photos live in **`originals/`** (untouched). Everything else here is generated
from them by `scripts/process-images.py`:

| Output | Used for |
|--------|----------|
| `*-color.webp` | cleaned full-colour versions (gallery hover) |
| `*-duo.webp` | ink→gold **duotone** graphics (gallery default state) |
| `hero-color.webp` | texture for the WebGL portrait relief |
| `hero-duo.webp` | static fallback if WebGL is unavailable |
| `gaze-halftone.webp` | **halftone** screen-print poster (About section) |

Slugs: `march` (protest), `room` (standing), `evening` (café), `gaze` (selfie — hero/poster),
`red` (red sweater — WebGL relief).

## Swapping photos

Drop new files into `originals/` (keep the slug names, or edit `JOBS` in the script), then:

```bash
pip install Pillow numpy
python3 scripts/process-images.py
```

## Still needed — book covers

Add the two book covers as **`book-1.jpg`** and **`book-2.jpg`** (≈ 800 × 1200, 2:3).
Until then the Books section shows a gradient placeholder.
