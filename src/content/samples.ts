import manifest from './samples.json'

/** Sample pet photos to try (CC0, see THIRD_PARTY_LICENSES.md). Tags say what each one tests. */
export type SampleDef = (typeof manifest.samples)[number]

export const SAMPLES: SampleDef[] = manifest.samples
