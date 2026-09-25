# Project Plan — Pawp Atelier (Custom Pet Goods 3D Shop)

Name: **Pawp Atelier** (decided). Earlier shortlist kept in §10 for reference.

## 1. Concept
A web shop where customers put photos of their pets on custom goods (t-shirts, hoodies, mugs, tumblers, eco-bags, etc.).
- Reference shop: https://greenor.co.kr/18 (imweb, fixed design styles, no self-serve designer)
- Our difference: a live, casual, playful **3D customizer** in a cozy baked 3D "room" scene
- Visual reference: https://www.sooahs-room-folio.com/ (Blender baked-room + three.js portfolio; source: github.com/andrewwoan/sooahkimsfolio)

## 2. User Flow
1. **Choose product** from the catalog (mug, tumbler, tee, hoodie, eco-bag…). (Later: "buy on your behalf" external-link items)
2. **Upload pet photo(s)**, with optional background removal
3. **Templates**: stickers (under/over layers), backgrounds, color/theme, emojis, text
4. **Modifiers**
   - Basic: size, position, crop, rotation, layer order
   - Advanced: filters/effects (cartoonize, emboss, flare, pixelate, sharpen, blur, posterize, HSL)
5. **Randomize** with the "Reckless" slider (0 = sane, 50 = creative, 100 = go crazy)
6. **Shipping info and order** → checkout

The customization is always shown live on a 3D model. Pan/rotate/zoom is intuitive and casual: clamped limits with bouncy spring-back, not a pro 3D-tool feel.

## 3. Tech Stack
| Area | Choice |
|---|---|
| IDE | VS Code + Claude Code extension |
| Frontend | React + Vite + TypeScript |
| 3D | three.js via react-three-fiber (R3F) + drei |
| Controls | Custom `SpringyControls` (clamped, rubber-band, underdamped spring-back) |
| Animation | GSAP and/or @react-spring/three (hover squash/bounce, pop-in, camera fly-to) |
| 2D design canvas | Konva (react-konva) |
| State | Zustand (undo/redo, design history) |
| Filters | Konva built-in filters + custom WebGL shaders |
| Background removal (누끼) | One click: **BiRefNet HR-matting** (MIT) on a GPU server. Lasso/tap fallback: **SlimSAM** (Apache-2.0) in the browser, edges refined on the server. Not `@imgly` (AGPL) or BRIA RMBG (non-commercial), and rembg only with its BiRefNet/ISNet models |
| Backend (later) | Python FastAPI + Pillow + OpenCV + rembg (HQ effects, 300-DPI print file render) |
| Storage | Cloudflare R2 or S3 (design JSON + preview PNG + print file) |
| Hosting | Vercel or Cloudflare Pages |
| Commerce | Shopify (US) via Storefront API — OR imweb/Cafe24 + Toss/KG Inicis/KakaoPay (Korea) |
| 3D assets | Blender → GLB (Draco), textures WebP/KTX2 |

## 4. Core Architecture
- **2D print area → 3D texture.** Each product has a flat print-area canvas (mug wrap, shirt chest panel, tumbler band). The Konva canvas is used as a live `CanvasTexture` on the 3D model.
  - Mug/tumbler: cylinder UVs
  - Shirt/hoodie: GLB with a clean UV print region, or drei `<Decal>`
- **Design = JSON.** The same JSON renders a low-res browser preview and the high-res (300 DPI) print file on the server. We never print from the 3D scene.
- **Hybrid lighting (key decision)**
  - Environment/room: **baked** in Blender (Cycles → texture atlas, unlit material in three.js) for the portfolio-level look
  - Products: **real-time** material (MeshStandard/Physical) + env map, since the print changes live
  - Bake contact shadow/AO per product *shape* so products stay grounded
- **Scene modes**
  - Shop view: 3D studio diorama with products on shelves that wobble on hover
  - Edit view: camera flies to the chosen product, editor panels open
  - Order: fun "packing into box" animation → checkout

## 5. Reckless Randomizer Spec
- Every element exposes parameters (position, scale, rotation, filter strengths, colors, layer order), each with a defined "sane" range
- Slider r ∈ [0, 100] controls:
  - **Spread:** Gaussian σ around current/default values grows with r
  - **Range limits:** r=0 keeps elements inside the print area with harmonious palettes and subtle/no filters; r=100 allows extreme rotation, clashing palettes, stacked effects
  - **Structural changes:** probability of adding/removing stickers, emojis, text, effects grows with r
- **Seeded RNG:** every roll is reproducible
- **Roll history strip:** revert to any previous roll

## 6. Commerce & Fulfillment
- Preferred (US): **Shopify**. Handles tax, shipping, order emails, refunds, fraud checks.
  - Flow: "Add to cart" → upload design (JSON + preview PNG) → create Shopify cart via Storefront API with design ID as a line-item property → Shopify checkout → order shows design link
- Korea alternative: imweb/Cafe24 + Toss/KG Inicis, KakaoPay/Naver Pay
- Fulfillment options:
  - In-house printing (higher margin, more work)
  - Print-on-demand: Printful / Printify (Shopify integration, exact print-area specs, they ship)
- "Buy on their behalf" external-link items: deferred to a later phase (pricing, returns, liability complexity)

## 7. Phases
| # | Phase | Deliverable | Status |
|---|---|---|---|
| 0 | Decide | Target market (US/Korea), fulfillment method, 3–4 launch products, name | Name done |
| 1 | Viewer prototype | Vite + R3F app, placeholder mug, springy clamped controls, photo upload textured live | **Done** |
| 2 | Editor core | Konva canvas → 3D texture; move/scale/rotate/crop; undo/redo | **Done** (move/scale/rotate, crop, undo/redo) |
| 3 | Blender scene v1 | Studio diorama, baked lighting, GLB export (parallel with 1–2) | |
| 4 | Integration | Shop view ↔ edit view camera flights, hover bounces, loading screen | **Done** on a placeholder table (mug + tumbler); swap in the room after Phase 3 |
| 5 | Content & effects | Templates (stickers, backgrounds, themes, text, emojis), filters, background removal, cartoonize | Templates **done**; 누끼 **done**: one click + rough lasso / tap to keep or remove (dev model, non-commercial); next: filters, cartoonize. Assets: [RESOURCES.md](RESOURCES.md) |
| 6 | Randomizer | Reckless slider, seeded rolls, history strip | |
| 7 | Checkout | Design storage + Shopify (or Korean PG) integration | |
| 8 | Polish | Mobile optimization, sound, packing animation, more product models | |

## Go-live checklist
Must be done before the shop takes real orders.
- [ ] **Replace non-commercial dependencies.** Everything listed in `src/config/non-commercial.json`
  must be gone. `PAWP_LIVE=1 npm run build` refuses to build while the list isn't empty.
  - BRIA RMBG-1.4 (one-click background removal, `src/editor/cutout/bgRemoval.worker.ts`):
    switch to BiRefNet HR-matting (MIT) on a GPU server, or buy a BRIA commercial license.
- [ ] Always build the live site with `PAWP_LIVE=1 npm run build`.
- [ ] **Place-name lookup** (photo info card) uses OpenStreetMap's free public Nominatim + Overpass
  APIs: fair-use only (≤1 request/s, no heavy use; "commercial applications… might have
  access withdrawn"). Move to a paid geocoder (e.g. OpenCage, LocationIQ, Mapbox) or self-host
  before launch. Keep the "© OpenStreetMap contributors" credit if OSM data stays.
- [ ] Strip photo metadata (date/GPS in `PhotoLayer.meta` and in uploaded originals) before
  designs are stored with an order.

## 8. Constraints / Risks
- **Mobile first.** Most traffic is expected from Instagram on phones.
  - Total download < ~10 MB
  - Texture atlas ≤ 2048px
  - Test on mid-range Android early
  - Lightweight fallback mode (product only, no room)
- Print quality: enforce minimum photo resolution; warn on low-DPI uploads
- Print area specs must match the real products / POD provider templates

## 9. Open Decisions
- [ ] Target market: US or Korea (decides commerce stack)
- [ ] Fulfillment: in-house vs print-on-demand
- [ ] Launch product list
- [x] Brand name: **Pawp Atelier** (still to check: domain .com/.shop/.studio, Instagram handle, trademark USPTO / KIPRIS)
- [ ] Room scene art direction (wife's call — the room is the brand)

## 10. Name Shortlist (archived)
Paw Room, Boop Studio, Little Den, Pawp, Fluffprint, Pet Atelier; hybrids Boop Den, Pawp Atelier, Fluff Den, The Boop Room.
