# Pawp Atelier

Custom pet goods shop with a live, playful 3D customizer. See [docs/PLAN.md](docs/PLAN.md).

## Run

```sh
npm install      # first time / after dependency changes
npm run dev      # dev server → http://localhost:5173 (Ctrl+C to stop)
npm run build    # type-check + production build
```

Open http://localhost:5173, tap a product (or its card) to fly in, add a pet photo from the
Photo drawer (or borrow Leah), and edit it right on the product. "← Shop" flies back out.

Editing view controls (**3D** mode, the default):
- **On the product:** tap a layer to select it; drag the selected layer to move it along the
  surface; drag anything else to turn the product; scroll or pinch to zoom.
- **Handles:** corner dots resize, the ↻ knob rotates (snaps to 90°; Shift for free). Two fingers
  on a held layer pinch/twist it. Keyboard: arrows (Shift = bigger), `[` `]` rotate, `-` `=` resize.
- **Floating toolbar** under the selection: Remove BG, Lasso, Crop (full-screen tools), Effects,
  Edit/Style for text, forward/back, delete. Double-tap text to type on the product.
- **Category bar / rail:** Photo, Effects, Stickers, Text, Background open a drawer.
- **Wrap strip:** the whole print; the frame shows what faces you; tap a spot to turn there.

**Flat** mode (header switch): the full 2D editor. Scroll/pinch to zoom (up to 800%); drag empty
space, **Space + drag**, middle-mouse drag or two fingers to pan; **− / Fit / +** in the corner;
drag the handle between the 3D view and the editor to resize (double-click resets).

Code edits hot-reload instantly.

To stop: press `Ctrl+C` in the terminal running it. If that terminal is gone but the port is
still taken, run `fuser -k 5173/tcp`.

### Debug log

The app logs through `src/debug/log.ts` (`log.debug/info/warn/error(scope, msg, data)`).
In dev, every browser log line, plus uncaught errors, also prints in the `npm run dev` terminal:

```
12:09:54 AM [vite] (client) [console.info] [upload] pet.png 600x400, 61 KB {"effectiveDpi":127}
```

Set the level with `VITE_LOG_LEVEL=info npm run dev` (debug | info | warn | error; default debug).

Debug switches (dev only), added to the page URL:
- `?gpufail`: the background-removal worker pretends its GPU failed, to test the automatic
  switch to CPU (look for `[cutout] GPU failed, switching to CPU` in the log).
- `__pawpScene` in the browser console: the three.js scene.

### Live build (launch)

```sh
PAWP_LIVE=1 npm run build
```

Fails while `src/config/non-commercial.json` lists anything (dev-only models such as the current
background-removal model). Normal builds just print a warning. See the go-live checklist in
[docs/PLAN.md](docs/PLAN.md).

### Check on a phone

```sh
npm run dev -- --host
```

Open the printed `Network:` URL (e.g. `http://192.168.x.x:5173`) on a phone on the same Wi-Fi.
If it won't load, allow port 5173 in the firewall.

### Git

```sh
git log --stat   # commits and changed files (or VS Code Source Control: Ctrl+Shift+G)
```

## Layout

- `src/config/products.ts`: product specs (physical sizes in inches, 100 design units per inch)
- `src/store/designStore.ts`: Zustand store. `design` is plain JSON, with undo/redo history and crop state
- `src/editor/crop.ts`: crop geometry (crop box ↔ photo crop/size/position)
- `src/debug/log.ts`: scoped logger (echoed to the dev terminal)
- `src/editor/PrintCanvas.tsx`: Konva print-area editor. The print layer's canvas *is* the 3D texture;
  guides and transform handles sit on a separate layer so they never show on the product.
- `src/scene/`: R3F scene
  - `Scene.tsx`: table layout, shop/edit framing
  - `CameraRig.tsx`: fits a framing to any aspect, GSAP fly-to between views
  - `ProductSlot.tsx`: hover squash/bounce, tap to open, drag-turn while editing
  - `CylinderProduct.tsx`: placeholder mug/tumbler with the live print texture
  - `SpringyControls.tsx`: clamped drag, rubber-band, bouncy spring-back
  - `IdleFloat.tsx`: idle bob that resumes smoothly after a tab switch
