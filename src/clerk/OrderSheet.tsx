import { useState, type RefObject } from 'react'
import type { ProductSpec } from '../config/products'
import { useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { formatPrice } from './script'

/** At Leah's desk: what's being ordered, how many, the total, and checkout (coming later). */
export function OrderSheet({ spec, ref }: { spec: ProductSpec; ref: RefObject<HTMLElement | null> }) {
  const [qty, setQty] = useState(1)
  const layers = useDesignStore((s) => s.design.layers)
  const leaveCounter = useUiStore((s) => s.leaveCounter)
  const photos = layers.filter((l) => l.kind === 'photo').length
  const extras = layers.length - photos

  return (
    <section ref={ref} className="app__shop order">
      <h2>Your order</h2>
      <div className="order__line">
        <div>
          <div className="order__name">{spec.name}</div>
          <div className="order__meta">
            {photos ? `${photos} pet photo${photos > 1 ? 's' : ''}` : 'No photo yet'}
            {extras ? ` · ${extras} sticker${extras > 1 ? 's' : ''} or text${extras > 1 ? 's' : ''}` : ''}
          </div>
        </div>
        <div className="order__qty" role="group" aria-label="Quantity">
          <button className="btn btn--icon btn--small" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One less">
            −
          </button>
          <span aria-live="polite">{qty}</span>
          <button className="btn btn--icon btn--small" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="One more">
            +
          </button>
        </div>
        <div className="order__price">{formatPrice(spec.priceUsd * qty)}</div>
      </div>
      <p className="order__note">Shipping and tax are added at checkout.</p>
      <div className="order__actions">
        <button className="btn" onClick={leaveCounter}>
          Keep editing
        </button>
        <button className="btn btn--primary" disabled title="Checkout opens soon">
          Checkout · coming soon
        </button>
      </div>
    </section>
  )
}
