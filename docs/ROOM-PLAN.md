# Room Plan (Phase 3)

Status: **planned, not started** (2026-09-27).

Two room concepts get built as quick 3D "grayboxes" (simple blocks, real products, real camera
moves). We then compare them on a phone and either pick one or offer both to visitors. After
that, the chosen room(s) get modeled and baked in Blender.

Launch products: **mug, tumbler, t-shirt, phone case**. The rooms must have space for more
categories later (grip-tok, hat, keycaps, …).

## Art style: cartoon, and light (both rooms)

Stylized and toy-like rather than realistic. It keeps the scene light enough for mid-range phones
and matches the cartoon stickers (Fluent Emoji) already in the app.

- **Shapes:** chunky, rounded, low-poly furniture and props; few, bold details instead of many small
  ones (no tiny objects the camera never gets close to).
- **Color:** a small palette per room (see below), flat or softly graded colors; texture detail
  painted into the baked atlas, not modeled.
- **Light:** soft, warm light baked in Blender (with a gentle outline or rim feel if wanted); no
  real-time shadows except the contact shadows under products and the pet.
- **Budget:** about **50–80k triangles** for a whole room, 1–2 atlases ≤ 2048 px, unlit materials,
  GLB with Draco ≤ 5–8 MB.
- **Products stay honest:** the room can be cartoony, but the print on the product must show its
  real colors, so products keep a soft, simple shaded material (not a banded toon shader on the
  print). Their heavy "physical" material (clearcoat) gets swapped for a lighter one on phones.
- **Pets fit the style:** the standee (paper-doll / acrylic look) is already cartoon-friendly; the
  "toy figure" option would match the room style most closely later.

## The two concepts

### A. The Atelier (workshop)
A small sunlit craft studio where Pawp goods are "made". Cozy, handmade, story-driven.

| Zone | Holds | Display |
|---|---|---|
| Drinkware shelf | mug, tumbler | wall shelves |
| Apparel corner | t-shirt (hats later) | dress form, hooks |
| Accessory cabinet | phone cases (grip-tok, keycaps later) | printer's type-case cabinet; each category is a drawer that slides open |
| Workbench | the product being edited | edit stage |
| Leah's corner | mascot | dog bed with Leah napping |

Palette: cream `#F6EFE6`, honey wood `#E2C29F`, strawberry `#D9607F`, sage `#9BBF9A`.
Grows by adding a shelf or a drawer.

### B. Concept Store (select shop)
A bright, modern boutique. Clean, premium, retail-natural.

| Zone | Holds | Display |
|---|---|---|
| Wall shelves | mug, tumbler | floating oak shelves |
| Clothing rail | t-shirt (hats later) | rail with hangers, folded stack |
| Accessory counter | phone cases (grip-tok, keycaps later) | glass counter, like a jewelry case |
| Center table | the product being edited | edit stage |
| Leah's corner | mascot | a dog bed by the counter |

Palette: warm white `#FAF7F2`, oak `#D8B98C`, terracotta `#D98C5F`, soft black `#2B2B2B`.
Grows by adding a shelf section or a counter tray.

## How it works (both rooms)

**Three camera levels:**
1. **Room**: the whole room; zones glow softly on hover, with name tags on phones.
2. **Zone**: tap a zone (or a zone chip) → the camera flies there; products are big enough to
   read, even small ones like phone cases.
3. **Product**: tap a product → it hops from its spot onto the **edit stage** (workbench / center
   table) and the camera flies in; the current 3D editing UI takes over.

"Back" goes up one level (product → zone → room). The existing camera rig already flies between
named framings, so zones are new framings plus a small navigation state.

**Portrait first:** the room overview uses a tall composition (a wall of stacked zones) on phones
and a wider one on desktop: each room defines camera shots per orientation.

**Visitor choice:** if we keep both rooms, a small switch in the shop header ("Atelier / Store")
remembered per browser. Only the active room's model is downloaded.

## Your pet in the room

The customer's own pet lives in the room (in the pet corner: the dog bed), made from the photo they
uploaded. With no photo yet, **Leah** is there as the shop dog.

**Which photo:** the pet photo on the current design (the first one, or the selected one). If it
isn't cut out yet, the background is removed automatically in the background (same cutout tools,
same license flag). Everything happens in the browser; the photo isn't uploaded.

**How the pet becomes 3D** (from cheap to heavy):

| Option | What it looks like | Effort | Notes |
|---|---|---|---|
| **1. Standee** ⭐ start here | The cutout as a thick acrylic-stand / paper-doll figure with a white outline and a little base; gentle breathing / bob, hops when the design changes, turns toward the product being edited | Low | Works for any animal, instant, very cute. Bonus: "acrylic stand" is a sellable product idea in itself |
| **2. Depth pop** | Same cutout, but pushed into 2.5D using an AI depth map, so it has real volume and parallax as the camera moves | Medium | Depth model in the browser (e.g. Depth Anything V2 **Small**: check license; the larger sizes are non-commercial) |
| **3. Toy figure** | A stylized low-poly dog/cat template (Animal Crossing-like), colored automatically from the photo's fur colors; can be animated (tail wag, sleep) | Medium–high | Needs template models per body type; consistent with a baked Blender room; looks less like the actual pet |
| **4. AI 3D model** | A full 3D model generated from the photo | High | Server GPU, seconds to minutes per pet, quality varies. Candidates to check: TripoSR / TRELLIS (MIT), Stable Fast 3D (license limits by revenue), Hunyuan3D (license excludes South Korea, EU, UK) |

**Plan:** Option 1 first (it fits R1). Option 2 as an upgrade once the room is in. Options 3–4 are
later experiments.

**Pet profile ("Show us your pet!"):** a friendly first step, *"Give us a few photos of your pet
and they'll move into the shop!"*, with 1–5 photos and a name. The profile is used everywhere:
- **In the room:** the pet (standee) in the pet corner, picked from the best cutout; the other photos
  go up as cartoon **photo frames / polaroids on the wall**, so the room becomes their pet's room.
- **In the editor:** a "My pet" album at the top of the Photo drawer (no re-uploading), and the
  pet's name offered as text and used by the Surprise randomizer ("Mochi's favorite mug").
- **Later:** several angles make a better 3D pet (multi-photo AI 3D, e.g. TRELLIS; or a standee that
  switches photos as the camera moves around it).
- **Guided so we get enough good photos:** photo slots with little illustrations, "Face (looking at
  you)", "Side", "Whole body", "Favorite pose", plus a free "More" slot. Each photo gets a quick
  check: big enough to print, not blurry, a pet actually found (the cutout mask isn't empty),
  with a friendly nudge when one fails ("A bit blurry, got a sharper one?"). A progress hint
  ("3 of 4: add a side view for a better 3D pet") encourages completing the set.
- **Privacy:** stays in the browser (IndexedDB), remembered for return visits, with a clear
  "Forget my pet" button; only uploaded when an order needs the photos. Photo metadata (GPS) is
  never kept in the profile.

**Leah as the default:** a Leah standee from her sample photo in the graybox; in the final room,
ideally a hand-modeled Leah in the same baked Blender style (the shop's mascot).

## Architecture

- **Rooms are data.** `RoomDef` = id, name, environment (graybox now, GLB later), zones, camera
  shots, edit-stage position. `ZoneDef` = id, label, categories, camera framing, **product slots**
  (position/rotation/scale per product).
- **Blender-friendly slots.** In the final GLB, slots, zones, the edit stage and camera shots are
  **named empties** (`slot_drinkware_1`, `zone_apparel`, `stage`, `cam_room_portrait`, …). The code
  reads them, so furniture can be moved in Blender without code changes. The graybox uses the
  same names.
- **Products get a type and a category.** `ProductSpec` becomes a union:
  - `cylinder`: mug, tumbler (existing)
  - `flat`: phone case back (rounded-rect print area, camera cutout masked), t-shirt chest print
  - later: `dome` (grip-tok), `curved-front` (hat), `grid` (keycaps)

  Each type provides its own **surface mapping** (design ↔ 3D point), so on-product editing,
  hit-testing, handles and the wrap strip keep working. This is the UI redesign's Phase 6.
- **Per-product print textures** already exist; new products just get their own.
- **The wrap strip** becomes a "print area" preview for flat products (no wrap-around).

## Milestones

| # | Milestone | Deliverable |
|---|---|---|
| R1 | Room system + Atelier graybox | `RoomDef`/zones/slots; room → zone → product navigation; product hop to the edit stage; mug + tumbler in their zone; t-shirt and phone case as display-only placeholders |
| P0 | Pet profile | "Show us your pet!" step with guided photo slots (face, side, whole body, pose) and quality checks; name; stored in the browser; "My pet" album in the Photo drawer; name in text suggestions and the randomizer; "Forget my pet" |
| P1 | Pet standee | The customer's pet (or Leah) as an acrylic-stand figure in the pet corner, from the cutout photo; idle bob, hop on design changes, faces the product being edited |
| R2 | Concept Store graybox + switch | Second room on the same system; header switch for side-by-side comparison on a phone |
| R3 | T-shirt & phone case products | Specs (print areas matched to the US print-on-demand templates, e.g. Printful), placeholder models, flat surface mapping, on-product editing for both |
| R4 | Review | Try both on a phone → pick one or keep both; write the art brief for Blender (props, palette, camera shots, slot names) |
| R5 | Blender room(s) | Model + bake (Cycles → texture atlas, unlit in three.js), export GLB with named empties; loader (Draco + KTX2); replace the graybox |
| R6 | Room life (later, with polish) | Hover wobbles, drawers sliding open, Leah's idle animation, sounds |
| P2 | Pet depth pop (later) | The standee gets real volume from an AI depth map (license check first) |

## Blender handoff spec (for R5)

- One or two baked atlases, **≤ 2048 px**, WebP or KTX2; unlit materials in three.js.
- **GLB with Draco**, target **≤ 5–8 MB** per room (the build's size check fails anything over
  24 MiB; big files go to R2).
- Products are **not** baked (they're live); bake a soft contact shadow under each slot instead.
- Named empties for slots, zones, the edit stage and camera shots (see Architecture).
- Keep the area in front of the edit stage open: the drawer and the category bar cover the left
  (desktop) or bottom (phone) of the screen.

## Open questions

1. **Phone case models** for launch: which phones (e.g. latest iPhone + Galaxy)? Each model is its
   own print template.
2. **T-shirt:** print area (front chest only, or front + back) and colors.
3. **Edit stage vs in place:** the plan is "product hops to the stage". Editing in place (camera
   flies to the shelf) is the fallback if the hop feels slow.
4. After R4: **one room or both** for visitors?
5. **Pet in the room:** one pet per profile to start; households with several pets (several profiles,
   several standees) later?
6. **Pet profile step:** shown on the first visit (skippable), or only when the visitor taps the pet
   corner / "Add your pet"?
7. **Keeping photos beyond an order** (e.g. to improve the 3D pet over time, or to build our own
   training data later) needs explicit, separate opt-in consent and a privacy policy that says so.
   Default: no.
