# UI Redesign: edit on the 3D product

Status: **approved; Phase 1 spike in progress.** Replaces the right-hand 2D editor panel with editing
directly on the 3D product, like a game character customizer.

## Goal

- The product is the canvas: tap a sticker/photo/text *on the mug* to select it, drag it along
  the surface, pinch/twist to scale and rotate.
- Controls float next to what you're editing, and only the ones that make sense right now show up.
- Choosing content (stickers, fonts, effects, backgrounds) happens in a drawer that slides over the
  scene, the way a game shows hairstyles or outfits, while the product stays in view and updates live.
- No separate "2D editor + 3D preview". The flat view becomes an optional tool, not the main UI.

## Why it's feasible now

- **The print is already separate from the editing view.** A hidden, fixed-size canvas renders the
  design and feeds the 3D texture (`PrintCanvas` → print stage). The visible 2D stage is just one
  view of it and can be removed without touching the print pipeline.
- **The design ↔ surface mapping is exact.** For the mug/tumbler print band:
  - design `x` → angle `θ = bandStart + (x / width) · bandArc`
  - design `y` → height on the band
  - surface point = `(r·sin θ, h, r·cos θ)` in the product's frame.

  So any design point (a layer's center, its corners, a handle) can be placed in 3D and projected
  to the screen. The other direction also works: a tap raycast on the band returns a UV, which maps
  straight back to design coordinates.
- **The UI pieces are already components.** Sticker, text, background, effects and photo-info panels
  can move into a drawer as-is.

## The experience

**Shop → product:** unchanged. Tap a product, the camera flies in.

**On the product:**
- **Tap a layer on the mug** → it's selected. You get:
  - an outline plus corner/rotate handles drawn in screen space around its projected box;
  - a **floating toolbar** just above it: Remove BG, Lasso, Crop, Effects, Forward/Back, Delete.
  - If it's on the far side, the mug **turns to face you** (springy, like now).
- **Drag a layer** → it slides along the surface; wrapping around the mug keeps working.
- **Drag empty surface or background** → turns the mug (as now).
- **Pinch / twist** with two fingers on a selected layer → scale / rotate it. Pinch on nothing → zoom.
- **Text:** double-tap to edit, with an input floating at the text's spot on the mug.

**Adding things:** a bottom **category bar**: Photo · Stickers · Text · Effects · Background.
- Tapping one opens a **drawer** over the lower part of the scene with thumbnails and options.
- The camera reframes so the product stays fully visible above the drawer (the shop picker does
  this already).
- New items land on the side of the mug facing you.

**Precision tools (the "not a total separation" part):**
- **Crop and Lasso** open a full-screen flat view of *that photo only* (like a phone photo editor),
  then close back to the mug. Drawing a lasso on a curved surface would be awkward; flat is better.
- **Wrap strip:** a small flat preview of the whole print under the mug (a mini-map). Tap a spot
  to turn the mug there. It shows what's on the back and where the handle/seam is.
- Optional **Flat view** toggle for power users: the current 2D editor, full screen. Keep it during
  the transition; remove it later if nobody needs it.

## Technical plan

| Piece | How |
|---|---|
| Surface mapping | `ProductSurface` per product type: `designToLocal(x, y)`, `uvToDesign(u, v)`, `normalAt(x)`. Cylinder first; flat/decal surfaces (tote, tee) later. |
| Hit testing | Raycast the print band → UV → design point → topmost layer whose (rotated) box contains it. Text uses its measured box. |
| Drag on surface | Pointer → raycast each move → design delta. Past the band edge: clamp, or wrap onto the far side. |
| Handles & outline | Project the layer's 4 corners + center to the screen each frame; draw them as an SVG/HTML overlay (crisp, finger-sized, no 3D distortion). |
| Floating toolbar | HTML overlay at the projected top-center of the layer (drei `Html` or our own projection), flipped below it near screen edges. |
| Gestures | One finger: layer drag if a layer is hit, else turn the mug. Two fingers on a layer: scale + rotate; elsewhere: zoom. Extends the current `gestures.ts` / `SpringyControls`. |
| Face the selection | On select, spring the mug's spin so the layer's angle faces the camera. |
| Print pipeline | Unchanged: the hidden print stage stays the single source of the texture. The visible Konva stage is only used inside the modal Crop/Lasso/Flat views. |
| Layout | Mobile: scene full screen + bottom category bar + drawer. Desktop: category rail on the left, drawer as a side sheet over the scene. |

## Phases (each shippable on its own)

1. ✅ **Spike: select + drag on the mug** (built 2026-09-27; waiting for the on-phone go/no-go).
   Rules: tap selects, drag the *selected* layer moves it, any other drag turns the product.
   Surface mapping (`scene/surface.ts`), hit testing (`editor/layerGeometry.ts`), drag along the
   surface (`scene/useSurfaceEditing.ts`), outline + floating toolbar (`editor/SelectionOverlay.tsx`).
   The 2D panel stays as it is. *Go / no-go point:* does direct manipulation feel good on a phone?
2. ✅ **Handles & gestures** (built 2026-09-27): corner scale and rotate knob drawn on the 3D view
   (rotation snaps to 0/90/180/270° unless Shift), two-finger pinch + twist on a held layer,
   auto-face on selection, keyboard nudges (arrows / Shift, `[` `]` rotate, `-` `=` scale; a burst
   is one undo step). The floating toolbar moved below the layer.
3. ✅ **Drawer UI** (built 2026-09-27): edit view is the full 3D scene with a category bar
   (phone: bottom; desktop: left rail) and a drawer reusing the panels; the camera frames the
   product beside/above it; floating undo/redo; header **3D / Flat** switch (Flat = the old 2D
   editor). Crop and Lasso switch to Flat while active (their own full-screen tools: Phase 4).
   The print moved into an always-mounted `PrintStage`, so the product updates from any view.
4. **Modal tools:** full-screen Crop and Lasso for the selected photo; inline text editing on the mug.
5. **Wrap strip + cleanup:** mini-map of the whole print; remove the old panel/splitter; tune
   desktop layout.
6. **More products:** flat decal surfaces (tote/tee) once those models exist (after Phase 3 room work).

## Risks

- **Precision on a curved, small surface:** handled by auto-face, finger-sized screen-space
  handles, 3D zoom, and the flat tools for fine work.
- **Gesture conflicts** (turn mug vs. move layer vs. zoom): clear rules above; test on real phones
  early (Phase 1).
- **Seam/handle area:** layers can't be dragged into the unprinted gap; show the gap on the
  wrap strip.
- **Discoverability:** first-run hints ("Tap your pet to edit it"), plus the drawer always
  visible at the bottom.

## Decisions (2026-09-27)

1. **Flat view:** keep it as an optional toggle (full-screen 2D editor for precise layout).
2. **Desktop:** category rail on the left, drawer as a side sheet over the scene.
3. **Wrap strip:** yes.
4. Start with the **Phase 1 spike**, keeping the current panel until the go/no-go.
