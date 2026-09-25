# Third-Party Licenses

Assets and fonts from other authors that ship with Pawp Atelier. Sourcing rules and the vetting
notes are in [docs/RESOURCES.md](docs/RESOURCES.md). Full license texts are in [licenses/](licenses/).

## Stickers

| Asset | Files | License | Copyright |
|---|---|---|---|
| [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (Color SVG, 94 picked; commit `1ffb34c`) | `public/stickers/fluent/`, manifest `src/content/stickers.json` | MIT ([text](licenses/MIT-fluentui-emoji.txt)) | Copyright (c) Microsoft Corporation |

The MIT license covers the artwork only, not Microsoft trademarks: don't market products as
"Microsoft" or "Fluent" emoji.

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
| [BRIA RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) (downloaded at runtime, not bundled) | One-click background removal | bria-rmbg-1.4 | **No.** Development only; listed in `src/config/non-commercial.json` and must be replaced before launch |
