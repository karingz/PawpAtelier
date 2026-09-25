/** Messages between the editor and the background-removal worker. */

export type CutoutRequest = { id: string; src: string }

export type CutoutResponse =
  | { id: string; type: 'progress'; phase: 'download' | 'running'; percent: number }
  | {
      id: string
      type: 'done'
      /** One byte per pixel, row-major, at width x height (the photo's natural size). */
      alpha: Uint8ClampedArray
      width: number
      height: number
      info: { model: string; device: string; dtype: string; ms: number }
    }
  | { id: string; type: 'error'; message: string }
