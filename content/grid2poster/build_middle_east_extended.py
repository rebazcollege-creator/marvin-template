#!/usr/bin/env python3
"""Rebuild regions/middle_east_extended.geojson for grid2poster.

Coverage: the 13 core Middle East countries + Egypt + Iran + Azerbaijan +
Armenia + Turkey + Cyprus (no North Africa except Egypt).

Run this from inside your local grid2poster clone (where regions/mena.geojson
and regions/mediterranean.geojson already exist). It writes the boundary file
to regions/middle_east_extended.geojson.

    cd grid2poster
    source .venv/bin/activate
    python build_middle_east_extended.py
"""
import json
import urllib.request

NE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/ne_50m_admin_0_countries.geojson"
)

# 1) From MENA: keep Egypt + the 13 core ME, drop the other North African states
mena = json.load(open("regions/mena.geojson"))
drop = {"MAR", "DZA", "TUN", "LBY"}  # keep EGY
feats = [f for f in mena["features"] if f["properties"].get("iso_a3") not in drop]

# 2) Turkey + Cyprus from the bundled mediterranean file
med = json.load(open("regions/mediterranean.geojson"))
for f in med["features"]:
    if f["properties"].get("name") in ("Turkey", "Cyprus"):
        feats.append(f)

# 3) Iran, Azerbaijan, Armenia from Natural Earth (downloaded from GitHub)
print("Downloading Natural Earth boundaries...")
with urllib.request.urlopen(NE_URL, timeout=120) as r:
    ne = json.load(r)
want = {"IRN": "Iran", "AZE": "Azerbaijan", "ARM": "Armenia"}
for f in ne["features"]:
    a3 = f["properties"].get("ADM0_A3") or f["properties"].get("ISO_A3")
    if a3 in want:
        feats.append({
            "type": "Feature",
            "properties": {"name": want[a3], "iso_a3": a3},
            "geometry": f["geometry"],
        })

out = {"type": "FeatureCollection", "features": feats}
json.dump(out, open("regions/middle_east_extended.geojson", "w"))

names = sorted(str(f["properties"].get("name")) for f in feats)
print(f"Wrote regions/middle_east_extended.geojson ({len(feats)} features):")
print(", ".join(names))
