import { useRef, type ChangeEvent } from 'react'
import { MUG_11OZ, designSize } from './config/products'
import { PrintCanvas } from './editor/PrintCanvas'
import { loadImageSize } from './editor/useHtmlImage'
import { Scene } from './scene/Scene'
import { useDesignStore } from './store/designStore'

const spec = MUG_11OZ

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const photo = useDesignStore((s) => s.photo)
  const setPhoto = useDesignStore((s) => s.setPhoto)
  const updatePhoto = useDesignStore((s) => s.updatePhoto)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const src = URL.createObjectURL(file)
    try {
      const size = await loadImageSize(src)
      if (photo) URL.revokeObjectURL(photo.src)
      setPhoto({ id: crypto.randomUUID(), src, ...fitToPrintArea(size), rotation: 0 })
    } catch {
      URL.revokeObjectURL(src)
      alert("That file couldn't be opened as an image.")
    }
  }

  const remove = () => {
    if (photo) URL.revokeObjectURL(photo.src)
    setPhoto(null)
  }

  const recenter = () => {
    const { width, height } = designSize(spec)
    updatePhoto({ x: width / 2, y: height / 2, rotation: 0 })
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>Pawp Atelier</h1>
        <span className="app__product">{spec.name}</span>
      </header>

      <main className="app__main">
        <section className="app__viewer">
          <Scene spec={spec} />
          <p className="app__hint">Drag to turn the mug</p>
        </section>

        <section className="app__editor">
          <div className="toolbar">
            <button className="btn btn--primary" onClick={() => fileInput.current?.click()}>
              {photo ? 'Change photo' : 'Upload pet photo'}
            </button>
            <button className="btn" onClick={recenter} disabled={!photo}>
              Center
            </button>
            <button className="btn" onClick={remove} disabled={!photo}>
              Remove
            </button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={onFile} />
          </div>

          <PrintCanvas spec={spec} />

          <p className="app__note">
            {photo
              ? 'Drag to move. Pull the corners to resize, the top handle to rotate.'
              : 'Your photo appears here and on the mug. The dashed line is the safe print area.'}
          </p>
        </section>
      </main>
    </div>
  )
}

/** Fit the photo to 90% of the print height, centered (the wrap's center faces front). */
function fitToPrintArea(size: { width: number; height: number }) {
  const design = designSize(spec)
  const height = design.height * 0.9
  const width = Math.min((size.width / size.height) * height, design.width * 0.9)
  return {
    x: design.width / 2,
    y: design.height / 2,
    width,
    height: width * (size.height / size.width),
  }
}
