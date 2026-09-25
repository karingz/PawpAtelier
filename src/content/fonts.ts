// Text fonts (see THIRD_PARTY_LICENSES.md). Self-hosted via @fontsource; the CSS only
// declares the faces, and the browser downloads a unicode-range subset when text needs it.
import '@fontsource-variable/fredoka'
import '@fontsource/chewy'
import '@fontsource/pacifico'
import '@fontsource/patrick-hand'
import '@fontsource-variable/nunito'
import '@fontsource/jua'
import '@fontsource/do-hyeon'
import '@fontsource/gaegu'
import '@fontsource/dongle'
import '@fontsource/gowun-dodum'

export type FontDef = {
  id: string
  label: string
  /** CSS font-family list; Latin fonts fall back to a Korean one so Hangul still renders. */
  family: string
  script: 'latin' | 'korean'
  /** Some faces draw small at the same size (Dongle); scale picker previews to match. */
  previewScale?: number
}

const korean = (name: string) => `"${name}", sans-serif`
const latin = (name: string, hangulFallback = 'Jua') => `"${name}", "${hangulFallback}", sans-serif`

export const FONTS: FontDef[] = [
  { id: 'fredoka', label: 'Fredoka', family: latin('Fredoka Variable'), script: 'latin' },
  { id: 'chewy', label: 'Chewy', family: latin('Chewy'), script: 'latin' },
  { id: 'pacifico', label: 'Pacifico', family: latin('Pacifico', 'Gaegu'), script: 'latin' },
  { id: 'patrick-hand', label: 'Patrick Hand', family: latin('Patrick Hand', 'Gaegu'), script: 'latin' },
  { id: 'nunito', label: 'Nunito', family: latin('Nunito Variable', 'Gowun Dodum'), script: 'latin' },
  { id: 'jua', label: '주아 Jua', family: korean('Jua'), script: 'korean' },
  { id: 'do-hyeon', label: '도현 Do Hyeon', family: korean('Do Hyeon'), script: 'korean' },
  { id: 'gaegu', label: '개구 Gaegu', family: korean('Gaegu'), script: 'korean' },
  { id: 'dongle', label: '동글 Dongle', family: korean('Dongle'), script: 'korean', previewScale: 1.7 },
  { id: 'gowun-dodum', label: '고운돋움 Gowun', family: korean('Gowun Dodum'), script: 'korean' },
]

export function getFont(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]
}

/** Ask the browser to fetch the subsets needed to draw `text` in this font (canvas won't). */
export function loadFontFor(font: FontDef, text: string, px = 48) {
  return document.fonts.load(`${px}px ${font.family}`, text || 'Aa가').catch(() => [])
}
