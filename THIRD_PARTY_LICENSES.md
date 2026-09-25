# Third-Party Licenses

Assets and fonts from other authors that ship with Pawp Atelier. Sourcing rules and the vetting
notes are in [docs/RESOURCES.md](docs/RESOURCES.md). Full license texts are in [licenses/](licenses/).

## Stickers

| Asset | Files | License | Copyright |
|---|---|---|---|
| [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (Color SVG, 94 picked; commit `1ffb34c`) | `public/stickers/fluent/`, manifest `src/content/stickers.json` | MIT ([text](licenses/MIT-fluentui-emoji.txt)) | Copyright (c) Microsoft Corporation |

The MIT license covers the artwork only, not Microsoft trademarks: don't market products as
"Microsoft" or "Fluent" emoji.

## Sample photos

Offered to customers as "try one of ours", so they may end up printed on products.

**Leah** (`public/samples/leah-*.jpg`, 8 photos): the owner's own photos of their dog, used with
permission. All metadata (including GPS) was stripped on export; photos showing people's faces
were left out.

**Friends** (below): CC0 only.
All from Wikimedia Commons, CC0 1.0 (public domain dedication, no attribution required),
license re-checked via the Commons API on download. Manifest: `src/content/samples.json`.

| Photo | File | Author | Source |
|---|---|---|---|
| Kitten | `public/samples/kitten-look.jpg` | Saral Shots | [Commons](https://commons.wikimedia.org/wiki/File:Kitten_Looking.jpg) |
| Dog on grass | `public/samples/dog-grass.jpg` | Joselodos | [Commons](https://commons.wikimedia.org/wiki/File:Dog_resting_on_the_grass.jpg) |
| Staffy puppy | `public/samples/staffy-puppy.jpg` | Olga Fučíková | [Commons](https://commons.wikimedia.org/wiki/File:Staffordshire-bull-terrier-puppy-fawn-2166763.jpg) |
| Corgi puppy | `public/samples/corgi-puppy.jpg` | Capersfish | [Commons](https://commons.wikimedia.org/wiki/File:8_week_old_corgi_girl.jpg) |
| Golden with stick | `public/samples/golden-stick.jpg` | Cheetyuh | [Commons](https://commons.wikimedia.org/wiki/File:Golden_Retriever_Chewing_A_Stick.jpg) |
| Kitten with ball | `public/samples/kitten-ball.jpg` | Aiaikz | [Commons](https://commons.wikimedia.org/wiki/File:Ginger_kitten_with_an_orange_rubber_rugby.jpg) |
| Two Shibas | `public/samples/two-shibas.jpg` | Novoklimov | [Commons](https://commons.wikimedia.org/wiki/File:Two_Shiba_Inu_dogs.jpg) |
| Dog and cat | `public/samples/dog-and-cat.jpg` | Gerda Arendt | [Commons](https://commons.wikimedia.org/wiki/File:Dog_and_cat,_Arco,_Madeira.jpg) |
| Shiba and a hand | `public/samples/shiba-hand.jpg` | Waved | [Commons](https://commons.wikimedia.org/wiki/File:Shiba_Inu_Mutt_1.jpg) |

## Fonts

Installed from npm (`@fontsource`), self-hosted. The OFL allows embedding as webfonts and using
rendered text on products we sell; it forbids selling the font files on their own.

| Font | Package | License | Copyright |
|---|---|---|---|
| Fredoka | `@fontsource-variable/fredoka` | OFL-1.1 | Copyright 2016 The Fredoka Project Authors |
| Chewy | `@fontsource/chewy` | Apache-2.0 ([text](licenses/Apache-2.0.txt)) | Sideshow (Google Fonts) |
| Pacifico | `@fontsource/pacifico` | OFL-1.1 | Copyright 2018 The Pacifico Project Authors |
| Patrick Hand | `@fontsource/patrick-hand` | OFL-1.1 | Copyright (c) 2010-2012 Patrick Wagesreiter |
| Nunito | `@fontsource-variable/nunito` | OFL-1.1 | Copyright 2014 The Nunito Project Authors |
| Jua 주아 | `@fontsource/jua` | OFL-1.1 | Copyright 2018 The BM JUA Project Authors (Woowahan Brothers) |
| Do Hyeon 도현 | `@fontsource/do-hyeon` | OFL-1.1 | Copyright 2018 The Do Hyeon Project Authors (Woowahan Brothers) |
| Gaegu 개구 | `@fontsource/gaegu` | OFL-1.1 | Copyright 2018 The Gaegu Project Authors |
| Dongle 동글 | `@fontsource/dongle` | OFL-1.1 | Copyright 2021 The Dongle Project Authors |
| Gowun Dodum 고운돋움 | `@fontsource/gowun-dodum` | OFL-1.1 | Copyright 2021 The Gowun Dodum Project Authors |

OFL-1.1 full text: [licenses/OFL-1.1.txt](licenses/OFL-1.1.txt).

## AI models and libraries

| Component | Used for | License | Commercial use |
|---|---|---|---|
| [transformers.js](https://github.com/huggingface/transformers.js) (`@huggingface/transformers`) | Runs AI models in the browser | Apache-2.0 | Yes |
| [SlimSAM-77](https://huggingface.co/Xenova/slimsam-77-uniform) (downloaded at runtime) | Lasso / tap object selection | Apache-2.0 | Yes |
| [exifr](https://github.com/MikeKovarik/exifr) | Reads date/GPS from uploaded photos | MIT | Yes |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) data via Nominatim + Overpass (online, on request) | Place names for photo locations | ODbL 1.0, credit "© OpenStreetMap contributors" shown in the UI | Yes; the free APIs are fair-use only (see go-live checklist) |
| [BRIA RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) (downloaded at runtime, not bundled) | One-click background removal | bria-rmbg-1.4 | **No.** Development only; listed in `src/config/non-commercial.json` and must be replaced before launch |
