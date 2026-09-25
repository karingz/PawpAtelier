# Pawp Atelier

Custom pet goods shop with a live, playful 3D customizer. See [docs/PLAN.md](docs/PLAN.md).

## Run

```sh
npm install      # first time / after dependency changes
npm run dev      # dev server → http://localhost:5173 (Ctrl+C to stop)
npm run build    # type-check + production build
```

Open http://localhost:5173, tap a product (or its card) to fly in, upload a pet photo,
drag/resize/rotate/crop it on the flat canvas and watch the product update live. Drag the
product to spin it; let go to see it spring back. "← Shop" flies back out.
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
