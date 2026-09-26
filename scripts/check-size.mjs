// Fails the build if any file in dist/ is too big for Cloudflare Pages (25 MiB hard limit per
// file; we stop at 24 MiB to leave headroom). Big assets (models, videos) belong in R2 or a CDN.
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const LIMIT = 24 * 1024 * 1024
const root = new URL('../dist/', import.meta.url).pathname

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else yield path
  }
}

const mib = (n) => `${(n / 1024 / 1024).toFixed(1)} MiB`
const all = [...files(root)].map((path) => ({ path: relative(root, path), size: statSync(path).size }))
const tooBig = all.filter((f) => f.size > LIMIT)
const largest = [...all].sort((a, b) => b.size - a.size)[0]

if (tooBig.length) {
  console.error(`\n✖ dist/ has files over ${mib(LIMIT)} (Cloudflare Pages rejects files over 25 MiB):`)
  for (const f of tooBig) console.error(`  ${f.path}  ${mib(f.size)}`)
  console.error('  Load them from a CDN or R2 at runtime instead of bundling them.\n')
  process.exit(1)
}
console.log(`✓ size check: ${all.length} files, largest ${largest.path} (${mib(largest.size)})`)
