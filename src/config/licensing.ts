import nonCommercial from './non-commercial.json'
import { log } from '../debug/log'

export type NonCommercialDependency = (typeof nonCommercial.dependencies)[number]

/** Things we may use while building, but must replace before selling. */
export const NON_COMMERCIAL_DEPENDENCIES: NonCommercialDependency[] = nonCommercial.dependencies

/** Loud reminder on every app start (dev and preview builds). */
export function warnNonCommercialDependencies() {
  for (const d of NON_COMMERCIAL_DEPENDENCIES) {
    log.warn('license', `NON-COMMERCIAL: ${d.name} (${d.usedFor}). Replace before going live: ${d.replaceWith}`)
  }
}
