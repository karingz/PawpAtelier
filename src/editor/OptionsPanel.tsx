import type { ProductSpec } from '../config/products'
import { useOptionsStore, useProductOptions } from '../store/optionsStore'

/** The blank's options: tee color and print side, case finish, … (the same questions Leah asks). */
export function OptionsPanel({ spec }: { spec: ProductSpec }) {
  const chosen = useProductOptions(spec)
  const choose = useOptionsStore((s) => s.choose)
  return (
    <div className="panel__body">
      {spec.options?.map((o) => (
        <section key={o.id}>
          <h3 className="panel__title">{o.label}</h3>
          <div className="option-choices">
            {o.choices.map((c) => (
              <button
                key={c.id}
                className={`btn btn--small option-choice${chosen[o.id] === c.id ? ' option-choice--on' : ''}`}
                onClick={() => choose(spec.id, o.id, c.id)}
                aria-pressed={chosen[o.id] === c.id}
              >
                {c.color && <span className="option-choice__swatch" style={{ background: c.color }} aria-hidden />}
                {c.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
