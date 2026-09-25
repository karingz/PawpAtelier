import manifest from './stickers.json'

export type StickerDef = { id: string; name: string; category: string; src: string }

export const STICKERS: StickerDef[] = manifest.stickers

export const STICKER_CATEGORIES = [
  { id: 'pets', label: 'Pets' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'party', label: 'Party' },
  { id: 'food', label: 'Treats' },
  { id: 'nature', label: 'Flowers' },
  { id: 'faces', label: 'Faces' },
] as const
