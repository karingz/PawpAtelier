# Pawp Atelier

Custom pet goods shop with a live, playful 3D customizer. See [docs/PLAN.md](docs/PLAN.md).

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Layout

- `src/config/products.ts`: product specs (physical sizes in inches, 100 design units per inch)
- `src/store/designStore.ts`: Zustand design state + the shared print canvas
- `src/editor/PrintCanvas.tsx`: Konva print-area editor. The print layer's canvas *is* the 3D texture;
  guides and transform handles sit on a separate layer so they never show on the product.
- `src/scene/`: R3F scene, placeholder `Mug`, and `SpringyControls` (clamped drag, rubber-band, bouncy spring-back)
