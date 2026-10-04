# Goblin Helm

A procedural 3D build of the goblin-helmet reference sheet (turnaround, detail close-ups, sculpt/wireframe, palette, materials), rendered in the browser with Three.js.

Open `index.html` in any modern browser. No build step; Three.js r147 loads from jsDelivr.

## What's modelled

- **Head shell**: one closed surface (320×240 lat-long grid) deformed from a sphere into the teardrop helmet shape (swept-back hood, long pointed jaw), then sculpted with displacement functions: angry V brow plates, slanted eye sockets, flat nose plate, cheekbone plates, nasolabial folds, jaw ridges, chin keel, crown crest, back panel seams and the forehead hairline seam.
- **Mouth**: a deep recessed maw with a rolled lip; upper and lower teeth (with fangs) are raycast onto the sculpted rim.
- **Eyes**: mirror-gold ellipsoid lenses seated in the sockets.
- **Ears**: bevelled, extruded swept blades with an inset mauve panel.
- **Materials**: iridescent chrome (green face, lilac-steel crown), gold lenses, rose-ivory teeth, lit by a procedural softbox studio environment.

## Viewer

- Views: Front, L ¾, Left, R ¾, Right, Back (matching the turnaround sheet)
- Render modes: Chrome, Sculpt (clay), Wire (low-res topology)
- Turntable auto-rotate; drag to orbit, scroll or pinch to zoom
