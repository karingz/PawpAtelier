# Deploy — Cloudflare Pages

## Current setup
- Cloudflare Pages project connected to GitHub repo `karingz/PawpAtelier`
  (dashboard: Compute → Workers & Pages → project).
- Build settings:
  - Framework preset: **React (Vite)**
  - Build command: `npm run build` (type-check, Vite build, then the size check below)
  - Build output directory: `dist`
  - Environment variable: `NODE_VERSION=22`
- Deploys:
  - Push to `main` → production at `pawpatelier.pages.dev`
  - Push to any other branch → its own preview URL
  - Build logs: project → Deployments tab

## Free tier limits (Pages)
- Unlimited sites, bandwidth and static requests
- 500 builds/month, 1 concurrent build, 20-min build timeout
- 20,000 files per deployment (we're at ~1,100, mostly Korean font subsets)
- **25 MiB max per single file** (hard limit: the deploy fails)

## The 25 MiB limit and background removal
The first deploy failed on `assets/ort-wasm-simd-threaded.asyncify-*.wasm` (26.9 MB). That is
ONNX Runtime's WebAssembly, pulled in by **transformers.js** (the background-removal worker).

It was never needed in `dist/`: transformers.js already points ONNX Runtime at the matching
file on the jsDelivr CDN at runtime; Vite only copied it because of a fallback reference. So:
- `vite.config.ts` → `dropBundledOrtWasm()` removes `ort-wasm*.wasm` from the build output.
- The AI models (RMBG, SlimSAM) were always downloaded at runtime from Hugging Face.
- The worker only loads when someone presses Remove BG / Lasso.
- Verified on the production build (`vite preview`): the cutout works on CPU and WebGPU, with the
  `.wasm` fetched from `cdn.jsdelivr.net`.

**Guard:** `scripts/check-size.mjs` runs after every build and fails it if any file in `dist/` is
over 24 MiB, so an oversized file (e.g. a big Blender GLB) fails the build with a clear message
instead of a failed deploy.

Before launch, consider self-hosting the ONNX `.wasm` + models on R2 (no third-party CDN at
runtime; set `env.backends.onnx.wasm.wasmPaths` and the model host in the worker). The
background-removal model itself must be replaced anyway (see the go-live checklist in PLAN.md).

## Asset rules
- Static assets (GLB models, textures, stickers, sample photos) go in `public/`.
- Keep Vite's default `base`.
- Compress GLB with Draco (e.g. `gltf-transform`); textures as WebP/KTX2.
- Anything over 24 MiB goes to R2 (or a CDN), not Pages.
- Don't add a `404.html`: without it Pages serves the app as a SPA.

## Planned (not built yet)
### Pages Functions / Workers (free: 100k requests/day, 10 ms CPU/request)
- Light logic only (CPU time excludes network waits):
  - issue one-time presigned upload URLs for R2
  - create the Shopify cart via Storefront API (design ID as a line-item property)
- No heavy image processing here (browser, or a separate Python server).

### R2 storage (free monthly: 10 GB, 1M writes, 10M reads, egress always free)
- Stores customer pet photos, design JSON, preview PNGs, print files.
- ~3–8 MB per order → roughly 1,500–3,000 orders within the free tier; then $0.015/GB-month.

### Flow
```
Browser (React + 3D, served by Pages)
  1. request upload URL ──► Pages Function / Worker
  2. upload photo/design ──► R2 (direct from browser)
  3. "Order" ──► Worker creates Shopify cart
  → Shopify checkout → order includes design link
```

### Later
- Custom domain via Cloudflare Registrar (~$10–15/yr) → Pages project → Custom domains.
- Optional: Cloudflare Access to password-protect preview/WIP deployments.
