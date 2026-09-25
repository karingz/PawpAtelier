import { useEffect, useState, type CSSProperties } from 'react'

const STORAGE_KEY = 'pawp:panel-size'
export const DESKTOP = '(min-width: 900px)'

/** Editor width on desktop and 3D view height on phones, in px (null = default layout). */
export type Sizes = { editorWidth: number | null; viewerHeight: number | null }

function loadSizes(): Sizes {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') return { editorWidth: saved.editorWidth ?? null, viewerHeight: saved.viewerHeight ?? null }
  } catch {
    // Storage blocked or corrupt: use the default layout.
  }
  return { editorWidth: null, viewerHeight: null }
}

function saveSizes(sizes: Sizes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes))
  } catch {
    // Not remembered this time; fine.
  }
}

/** CSS variables for `.app__main`, from the remembered panel sizes. */
export function usePanelSizes() {
  const [sizes, setSizes] = useState(loadSizes)
  useEffect(() => saveSizes(sizes), [sizes])
  const style = {
    ...(sizes.editorWidth ? { '--editor-w': `${sizes.editorWidth}px` } : {}),
    ...(sizes.viewerHeight ? { '--viewer-h': `${sizes.viewerHeight}px` } : {}),
  } as CSSProperties
  return { sizes, setSizes, style }
}

