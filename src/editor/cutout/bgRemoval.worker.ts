/// <reference lib="webworker" />
// Background removal ("누끼") off the main thread.
//
// ⚠️ NON-COMMERCIAL MODEL: BRIA RMBG-1.4 is only licensed for non-commercial use. It is listed in
// src/config/non-commercial.json and must be replaced (BiRefNet on a server, or a paid BRIA
// license) before the shop goes live. Swapping models only touches this file.

import { AutoModel, AutoProcessor, RawImage, env, type PreTrainedModel, type Processor } from '@huggingface/transformers'
import type { CutoutRequest, CutoutResponse } from './protocol'

const MODEL_ID = 'briaai/RMBG-1.4'

env.allowLocalModels = false

type Loaded = { model: PreTrainedModel; processor: Processor; device: string; dtype: string }
let loading: Promise<Loaded> | null = null

const post = (msg: CutoutResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer)

function load(requestId: string): Promise<Loaded> {
  loading ??= (async () => {
    const hasWebGPU = 'gpu' in navigator && !!(await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter())
    const device = hasWebGPU ? 'webgpu' : 'wasm'
    // fp16 keeps soft fur edges; the 8-bit model is smaller but bands the alpha a little.
    const dtype = hasWebGPU ? 'fp16' : 'q8'

    // Download progress summed over all files the model needs.
    const files = new Map<string, { loaded: number; total: number }>()
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      if (total > 0) post({ id: requestId, type: 'progress', phase: 'download', percent: (loaded / total) * 100 })
    }

    const model = await AutoModel.from_pretrained(MODEL_ID, {
      // RMBG is a custom architecture; load it as a plain ONNX model.
      config: { model_type: 'custom' } as never,
      device,
      dtype,
      progress_callback,
    })
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback })
    return { model, processor, device, dtype }
  })()
  loading.catch(() => (loading = null))
  return loading
}

self.onmessage = async ({ data }: MessageEvent<CutoutRequest>) => {
  const { id, src } = data
  try {
    const { model, processor, device, dtype } = await load(id)
    post({ id, type: 'progress', phase: 'running', percent: 0 })
    const started = performance.now()

    const image = await RawImage.fromURL(src)
    const { pixel_values } = await processor(image)
    const { output } = await model({ input: pixel_values })
    // 1024x1024 mask back to the photo's own size.
    const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(image.width, image.height)

    const alpha = new Uint8ClampedArray(mask.data)
    post(
      {
        id,
        type: 'done',
        alpha,
        width: mask.width,
        height: mask.height,
        info: { model: MODEL_ID, device, dtype, ms: Math.round(performance.now() - started) },
      },
      [alpha.buffer],
    )
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
