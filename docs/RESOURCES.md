# Template Resources (Phase 5)

Free assets for stickers, emoji, text and backgrounds. Licenses were checked against each
source's own license page or LICENSE file on 2026-09-25.

## The rule

Everything here gets **printed on products we sell**. Many "free for commercial use" libraries
forbid exactly that (merch / print-on-demand / "the asset is the main value"). So we only use:

- **CC0 / public domain**, or
- **MIT / Apache-2.0 / ISC / OFL** (no field-of-use limits), or
- **CC-BY** only as a fallback (credit required, see below).

Never: CC-BY-SA (share-alike would reach customer designs), NC, "personal use", or sites with
merch clauses (Freepik, Flaticon, Pixabay, Unsplash, Pexels, Vecteezy, Canva, Blush, DrawKit,
unDraw, Noun Project, Rawpixel).

**Before adding any new asset:** confirm its license at the source, add it to
[THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md), and skip anything with a brand, logo or
known character.

**Downloaded so far (safe tier only):** 94 Fluent Emoji Color SVGs in `public/stickers/fluent/`
(manifest: `src/content/stickers.json`, by category: pets, hearts, sparkle, party, food, nature,
faces) and the 10 starter fonts via `@fontsource`. Nothing from the "review each item" or
"still to verify" lists yet.

## Pick list

| Use | Source | License | Credit needed | Get it |
|---|---|---|---|---|
| Stickers + emoji (main) | [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji), **Color** or **Flat** SVG | MIT | Keep MIT notice in repo | GitHub zip |
| Emoji (backup set) | [Google Noto Emoji](https://github.com/googlefonts/noto-emoji), `2D/svg` | Apache-2.0 (images) | Keep license + NOTICE in repo | GitHub |
| Simple shapes (paw, bone, crown, sparkle) | [Phosphor](https://github.com/phosphor-icons/core) / [Tabler](https://github.com/tabler/tabler-icons) icons | MIT | Keep MIT notice | npm |
| Illustrated pets | [Kenney Animal Pack](https://kenney.nl/assets/animal-pack) | CC0 | No | Zip |
| Illustrated pets / frames / badges | [OpenClipart](https://openclipart.org/share) | CC0 (states "manufacture products") | No | Per item, **review each** |
| Doodle style | [Open Doodles](https://opendoodles.com) / [Open Peeps](https://openpeeps.com) | CC0 | No | Zip **from these sites, not Blush** |
| Fonts (Latin) | Fredoka, Chewy, Pacifico, Patrick Hand, Nunito | OFL (Chewy: Apache) | Keep license files | `@fontsource/*` npm |
| Fonts (Korean) | Jua, Do Hyeon (Baemin), Gaegu, Dongle, Gowun Dodum | OFL | Keep license files | `@fontsource/*` npm |
| Patterns (paws, dots, checkers, stripes, hearts, confetti, gradients) | **Generate in our own code** (SVG/canvas) | Ours | No | — |
| Extra seamless patterns | [Pattern Monster](https://pattern.monster) | MIT | Keep MIT notice | Copy SVG |
| Paper / fabric / watercolor textures | [ambientCG](https://ambientcg.com), [Poly Haven](https://polyhaven.com/textures) (use the Color/diffuse map) | CC0 | No | Manual download (no scraping) |
| Vintage patterns (William Morris, katagami) | [Met Open Access](https://www.metmuseum.org/hubs/open-access), [Rijksmuseum](https://www.rijksmuseum.nl/en/rijksstudio) | CC0 / OA per item | No | Per item, check the OA/CC0 mark |

## Notes per category

### Stickers & emoji
- **Fluent Emoji** is the cutest fit and includes dog/cat faces, paw prints, bone, fish, hearts,
  stars, crown, sparkles, flowers, food and speech bubbles. Use the **SVG** styles for print: the
  3D style is only 256 px PNG (about 0.85 in at 300 DPI).
- Pick **one** emoji set as primary; Fluent and Noto styles clash side by side.
- Skip logo and flag emoji. Don't market products as "Microsoft/Google emoji": the licenses cover
  the art, not the trademarks.
- OpenClipart and publicdomainvectors are user uploads: a few items are secretly copied or
  trademarked. Hand-check each one; skip anything tagged `pd_issue` or resembling a known
  character.

### Fonts
- The OFL explicitly allows design work on t-shirts, serving as webfonts, and use in apps where
  users type their own text. It only forbids selling the font file itself.
- Latin fonts have no Hangul: pair each with a Korean fallback in the CSS font stack and in the
  future server-side print renderer.
- Avoid Nexon Lv.1 Gothic and 여기어때 잘난체: their terms forbid modifying the files, and web
  subsetting/WOFF2 conversion arguably counts. Gmarket Sans and Cafe24 Ssurround look fine, but
  they use corporate terms and aren't on npm; only add them if we really want their look.

### Backgrounds
- Code-generated patterns are the core: vector-sharp at any print size, seamless, recolorable,
  zero license risk.
- Downloads only for what code does badly: paper/fabric textures and heritage patterns.

## CC-BY fallback (only if needed)

CC-BY allows commercial and merch use, but requires credit "in any reasonable manner based on the
medium": a credits page / product page line such as *"Emoji graphics by Twemoji, CC-BY 4.0"*,
plus a note if we modified them. Nothing needs to be printed on the product.

- [Twemoji](https://github.com/jdecked/twemoji) (flat emoji, CC-BY 4.0)
- [Hero Patterns](https://heropatterns.com) (small seamless SVG tiles, CC-BY 4.0, credit Steve Schoger)

## Still to verify

- **Noto Emoji `3D/` folder**: license not stated separately (assume Apache-2.0, confirm first).
- **Gmarket Sans**: confirm the terms with Gmarket directly.
- **Haikei** (blob/wave generator): terms allow using designs you make, but products aren't
  mentioned. Email hi@haikei.app before relying on it.
- **Pattern Craft**: reported MIT, LICENSE file not opened.
- A few pages blocked automated checks (SVG Repo, Rawpixel, Smithsonian); all three are
  excluded anyway.
