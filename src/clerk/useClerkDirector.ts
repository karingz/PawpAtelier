import { useEffect } from 'react'
import { getProduct } from '../config/products'
import { useDesignStore } from '../store/designStore'
import { useUiStore } from '../store/uiStore'
import { useClerkStore } from './clerkStore'
import { atCounter, greeting, productIntro, zoneIntro } from './script'

/**
 * Has Leah speak up as the visit goes on: a greeting when the shop appears, an intro the first
 * time each zone or product is visited, and the order summary at the counter. Anything she was
 * saying about the previous place stops when the visitor moves on.
 */
export function useClerkDirector(ready: boolean) {
  const view = useDesignStore((s) => s.view)
  const productId = useDesignStore((s) => s.productId)
  const zone = useUiStore((s) => s.zone)
  const counter = useUiStore((s) => s.atCounter)

  useEffect(() => {
    const { say, hush } = useClerkStore.getState()
    hush()
    if (view === 'edit' && counter) {
      say(atCounter(useDesignStore.getState().design.layers.length === 0))
    } else if (view === 'edit') {
      say(productIntro(getProduct(productId)), `product:${productId}`)
    } else if (zone) {
      say(zoneIntro(zone), `zone:${zone}`)
    }
  }, [view, productId, zone, counter])

  useEffect(() => {
    if (!ready) return
    // A moment after the room appears, so the visitor sees the shop before she talks.
    const t = setTimeout(() => {
      if (useDesignStore.getState().view === 'shop' && !useUiStore.getState().zone) useClerkStore.getState().say(greeting(), 'greet')
    }, 900)
    return () => clearTimeout(t)
  }, [ready])
}
