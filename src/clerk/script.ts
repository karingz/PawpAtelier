// What Leah says. Short lines, one idea each, in a friendly shop-clerk voice.

import { PRODUCTS, type ProductSpec, type ZoneId } from '../config/products'
import { useDesignStore } from '../store/designStore'
import { useOptionsStore } from '../store/optionsStore'
import { useUiStore } from '../store/uiStore'
import { useClerkStore, type ClerkLine } from './clerkStore'

export const formatPrice = (usd: number) => `$${usd.toFixed(2)}`

const ui = () => useUiStore.getState()
const design = () => useDesignStore.getState()

export function greeting(): ClerkLine[] {
  return [
    { text: "Hi, welcome to Pawp Atelier! I'm Leah, I look after the counter here. 🐾" },
    {
      text: 'Everything here gets your pet on it: mugs, tumblers, tees and phone cases. Tap anything to look closer!',
      choices: [{ label: 'Show me the mugs', run: () => ui().setZone('drinkware'), primary: true }, { label: "I'll look around" }],
    },
  ]
}

const ZONE_INTROS: Record<ZoneId, string> = {
  drinkware:
    'Mugs and tumblers! The mug wraps your pet all the way around, and the tumbler is tall enough for a whole-body photo. Which one?',
  apparel: 'Our classic tee: your pet on the front or the back, in white, black, grey or beige. Want to try it?',
  accessories:
    "Phone cases for the latest iPhone and Galaxy, soft matte or clear (clear ones show off your phone's color). Which phone?",
}

export function zoneIntro(zone: ZoneId): ClerkLine[] {
  const products = PRODUCTS.filter((p) => p.zone === zone)
  return [
    {
      text: ZONE_INTROS[zone],
      choices: [
        ...products.map((p) => ({ label: `${p.name} · ${formatPrice(p.priceUsd)}`, run: () => design().openProduct(p.id) })),
        { label: 'Just looking' },
      ],
    },
  ]
}

/** When a product goes to the workbench: its options (tee color, case finish, …), then how customizing works. */
export function productIntro(spec: ProductSpec): ClerkLine[] {
  const thing = spec.noun
  const { choose } = useOptionsStore.getState()
  const options: ClerkLine[] = (spec.options ?? []).map((o) => ({
    text: o.question,
    choices: o.choices.map((c) => ({ label: c.label, run: () => choose(spec.id, o.id, c.id) })),
  }))
  return [
    { text: `Great pick! Let's make this ${thing} yours.` },
    ...options,
    ...(options.length ? [{ text: `You can change that anytime: tap “${spec.kind === 'tee' ? 'Shirt' : 'Case'}” in the toolbar.` }] : []),
    {
      text: 'First, your pet: tap Photo and choose a picture. The photo tools can even cut out the background.',
      choices: [{ label: 'Add a photo', run: () => ui().openDrawer('photo'), primary: true }, { label: 'Next tip' }],
    },
    { text: `Drag your pet right on the ${thing} to move it. The corner handles resize and turn it.` },
    {
      text: 'When you love it, tap “Done” up top and bring it to my counter!',
      choices: [{ label: 'Got it!', primary: true }],
    },
  ]
}

const TIPS = [
  "Stuck? Try Surprise 🎲 and I'll remix your design. Slide it toward “go crazy” for wild ones!",
  'The strip under the product shows the whole print. Tap a spot on it to turn the product there.',
  "Stickers and text make it extra cute. How about your pet's name, or a “Good boy”?",
  'Effects can make your photo pop. Try Vintage, or Pop art for something bold.',
  'Want to see the whole print at once? Switch to Flat at the top.',
  'Made a mistake? Undo is at the top right, and it remembers a lot.',
]
let tip = 0

/** Tap Leah (or "Ask Leah") for help: a tip, then another if you like. */
export function askLeah() {
  useClerkStore.getState().say([
    {
      text: TIPS[tip++ % TIPS.length],
      choices: [{ label: 'Another tip', run: askLeah }, { label: 'Thanks, Leah!', primary: true }],
    },
  ])
}

/** Tapping Leah in the room (not editing): a little hello that points the way. */
export function hello(): ClerkLine[] {
  return [
    {
      text: 'Woof! Tap a shelf or the cabinet to look closer, and pick something to put your pet on.',
      choices: [{ label: 'Show me the mugs', run: () => ui().setZone('drinkware'), primary: true }, { label: 'Thanks!' }],
    },
  ]
}

/** At the counter: the order summary, or a nudge if the design is still empty. */
export function atCounter(blank: boolean): ClerkLine[] {
  if (blank) {
    return [
      {
        text: "Hmm, it's still blank! Want to put your pet on it first?",
        choices: [
          {
            label: 'Add a photo',
            run: () => {
              ui().leaveCounter()
              ui().openDrawer('photo')
            },
            primary: true,
          },
          { label: 'Keep it blank' },
        ],
      },
      { text: "A clean classic, then! Here's your order." },
    ]
  }
  return [{ text: "Ooh, that turned out adorable! Here's your order. 🐾" }]
}
