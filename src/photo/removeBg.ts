/**
 * 배경 제거: 브라우저 안에서 AI 모델(IS-Net, Apache-2.0 라이선스)을 돌려 상품만 남긴다.
 * 사진은 서버로 보내지 않고, API 비용도 들지 않는다.
 * 모델(약 170MB)은 처음 한 번 Hugging Face에서 내려받고, 그 뒤로는 브라우저 저장소(Cache API)에서 읽는다.
 * CPU(WASM)로 돌리므로 그래픽카드가 없는 PC·휴대폰에서도 같은 결과가 나온다.
 *
 * 모델 출처: BritishWerewolf/IS-Net (rembg의 isnet-general-use, 원본 xuebinqin/DIS — 모두 Apache-2.0)
 */
import type { PreTrainedModel, RawImage as RawImageType } from '@huggingface/transformers'

const MODEL_ID = 'BritishWerewolf/IS-Net'
/** 모델 입력 크기 (정사각형) */
const SIZE = 1024
/** 모델을 한 번이라도 끝까지 받았는지 (다음부터는 안내 없이 바로 시작) */
const READY_KEY = 'snsroom.photo.modelReady'
/** 이보다 흐린 부분은 완전히 지우고, 이보다 진한 부분은 완전히 남긴다(가장자리 얼룩 방지) */
const ALPHA_LOW = 10
const ALPHA_HIGH = 245

export type ModelProgress = { loaded: number; total: number }

/** 배경을 지운 상품: 투명한 여백을 잘라 낸 캔버스와, 원본 안에서의 위치 */
export type Cutout = {
  canvas: HTMLCanvasElement
  /** 원본 사진 안에서 상품이 있던 자리 (원본 크기 그대로 내보낼 때 사용) */
  x: number
  y: number
}

type Lib = typeof import('@huggingface/transformers')
type Loaded = { lib: Lib; model: PreTrainedModel }

let loading: Promise<Loaded> | null = null
/** 한 번에 1장씩만 돌린다(메모리 절약) */
let queue: Promise<unknown> = Promise.resolve()

export function isModelReady() {
  try {
    return localStorage.getItem(READY_KEY) === '1'
  } catch {
    return false
  }
}

/** 모델을 준비한다(처음에만 내려받음). 여러 번 불러도 한 번만 받는다. */
export function loadRemover(onProgress?: (p: ModelProgress) => void): Promise<Loaded> {
  if (!loading) {
    loading = createRemover(onProgress).catch((e) => {
      loading = null
      throw e
    })
  }
  return loading
}

async function createRemover(onProgress?: (p: ModelProgress) => void): Promise<Loaded> {
  const lib = await import('@huggingface/transformers') // 이 화면에서만 내려받는다
  // 사이트 안의 /models/ 를 먼저 찾지 않게 한다(Netlify가 index.html을 돌려줘 오류가 남)
  lib.env.allowLocalModels = false

  // 파일(설정·모델)별 진행률을 합쳐서 하나의 막대로 보여 준다
  const files = new Map<string, ModelProgress>()
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status !== 'progress' || !info.file || !info.total) return
    files.set(info.file, { loaded: info.loaded ?? 0, total: info.total })
    let loaded = 0
    let total = 0
    files.forEach((f) => {
      loaded += f.loaded
      total += f.total
    })
    onProgress?.({ loaded, total })
  }

  try {
    // 라이브러리가 모르는 모델 종류라 기본 모델 틀로 열고 입력·출력을 직접 다룬다
    const model = await lib.PreTrainedModel.from_pretrained(MODEL_ID, { device: 'wasm', dtype: 'fp32', progress_callback })
    try {
      localStorage.setItem(READY_KEY, '1')
    } catch {
      // 저장이 막힌 브라우저면 다음에도 안내를 다시 보여 줄 뿐이다
    }
    return { lib, model }
  } catch (e) {
    console.error('배경 제거 모델 준비 실패', e)
    throw new Error(
      `배경 제거 AI를 준비하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.${e instanceof Error ? ` (${e.message.slice(0, 120)})` : ''}`,
    )
  }
}

/** 사진 1장의 배경을 지운다. 사진 주소(blob: 또는 data:)를 받는다. */
export function removeBackground(imageUrl: string, onProgress?: (p: ModelProgress) => void): Promise<Cutout> {
  const run = queue.then(() => runOne(imageUrl, onProgress))
  queue = run.catch(() => undefined)
  return run
}

async function runOne(imageUrl: string, onProgress?: (p: ModelProgress) => void): Promise<Cutout> {
  const { lib, model } = await loadRemover(onProgress)
  const image = (await lib.RawImage.read(imageUrl)).rgb()

  // 1024×1024로 늘려 넣고 0~1로 바꾼 뒤 0.5를 뺀다(rembg isnet-general-use 방식)
  const resized = await image.resize(SIZE, SIZE)
  const plane = SIZE * SIZE
  const pixels = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) pixels[c * plane + i] = resized.data[i * 3 + c] / 255 - 0.5
  }

  const session = (model as unknown as { sessions: Record<string, { inputNames: string[]; run(feeds: object): Promise<Record<string, { data: Float32Array }>> }> }).sessions.model
  const feeds = { [session.inputNames[0]]: new lib.Tensor('float32', pixels, [1, 3, SIZE, SIZE]).ort_tensor }
  const outputs = await session.run(feeds)
  // 첫 번째 결과(1890)가 가장 정밀한 마스크다. output_image는 이 저장소가 덧붙인 합성 결과라 쓰지 않는다
  const raw = outputs['1890']?.data
  if (!raw) throw new Error('배경을 지우지 못했습니다. 다른 사진으로 시도해 주세요.')

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i]
    if (raw[i] > max) max = raw[i]
  }
  const range = max - min || 1
  const mask = new Uint8ClampedArray(plane)
  for (let i = 0; i < plane; i++) mask[i] = ((raw[i] - min) / range) * 255
  const full = await new lib.RawImage(mask, SIZE, SIZE, 1).resize(image.width, image.height)
  return cutProduct(image, full)
}

/** 원본과 마스크로 투명 배경 상품을 만들고, 투명한 여백을 잘라 낸다 */
function cutProduct(image: RawImageType, mask: RawImageType): Cutout {
  const { width: w, height: h } = image
  const rgb = image.data
  const m = mask.data
  const rgba = new Uint8ClampedArray(w * h * 4)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let a = m[i]
      if (a < ALPHA_LOW) a = 0
      else if (a > ALPHA_HIGH) a = 255
      rgba[i * 4] = rgb[i * 3]
      rgba[i * 4 + 1] = rgb[i * 3 + 1]
      rgba[i * 4 + 2] = rgb[i * 3 + 2]
      rgba[i * 4 + 3] = a
      if (a === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) throw new Error('사진에서 상품을 찾지 못했습니다. 상품이 잘 보이는 사진으로 시도해 주세요.')

  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  full.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0)

  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  canvas.getContext('2d')!.drawImage(full, minX, minY, cw, ch, 0, 0, cw, ch)
  return { canvas, x: minX, y: minY }
}
