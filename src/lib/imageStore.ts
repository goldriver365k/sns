import { useEffect, useRef, useState } from 'react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { PickedImage } from './images'

/**
 * 사진 저장소: 사진을 압축(JPEG, 긴 변 1600px)해 Firestore `images/{id}`에 저장한다.
 * Storage(유료 요금제 필요할 수 있음) 없이 PC에서 넣은 사진을 휴대폰에서도 볼 수 있게 하기 위함.
 * Firestore 문서 한 개는 1MB 제한이 있어 글자로 바꾼 크기가 900KB를 넘지 않게 품질을 낮춰 맞춘다.
 */
const MAX_SIDE = 1600
const MAX_CHARS = 900_000

function toJpegDataUrl(img: PickedImage) {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img.el, 0, 0, canvas.width, canvas.height)
  for (let q = 0.85; q >= 0.4; q -= 0.1) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= MAX_CHARS) return { url, width: canvas.width, height: canvas.height }
  }
  throw new Error('사진이 너무 커서 저장하지 못했습니다.')
}

export async function saveImage(img: PickedImage) {
  if (!db) throw new Error('저장소에 연결되지 않았습니다.')
  const { url, width, height } = toJpegDataUrl(img)
  await setDoc(doc(db, 'images', img.id), { data: url, width, height, source: img.source, createdAt: serverTimestamp() })
}

function loadEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('사진을 읽지 못했습니다.'))
    el.src = src
  })
}

/** 저장된 사진을 id 순서대로 불러온다(없는 것은 건너뜀). */
export async function loadImages(ids: string[]): Promise<PickedImage[]> {
  if (!db || ids.length === 0) return []
  const firestore = db
  const loaded = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(firestore, 'images', id))
        const d = snap.data()
        if (!d?.data) return null
        const el = await loadEl(d.data)
        return { id, url: d.data as string, el, source: d.source ?? 'file', width: d.width ?? el.naturalWidth, height: d.height ?? el.naturalHeight } as PickedImage
      } catch {
        return null
      }
    }),
  )
  return loaded.filter((x): x is PickedImage => !!x)
}

/**
 * 화면의 사진 목록 + 자동 저장.
 * 새로 넣은 사진은 바로 Firestore에 올리고, 목록이 바뀌면 onIdsChange로 id 순서를 알려 준다(콘텐츠 문서에 기록용).
 */
export function useStoredImages(initialIds: string[] | null, onIdsChange?: (ids: string[]) => void) {
  const [images, setImagesState] = useState<PickedImage[]>([])
  const [loading, setLoading] = useState(!!initialIds?.length)
  const [error, setError] = useState<string | null>(null)
  const saved = useRef(new Set<string>(initialIds ?? []))
  const idsKey = (initialIds ?? []).join(',')

  useEffect(() => {
    if (!initialIds?.length) return
    let alive = true
    setLoading(true)
    loadImages(initialIds)
      .then((list) => {
        if (!alive) return
        initialIds.forEach((id) => saved.current.add(id))
        setImagesState(list)
        if (list.length < initialIds.length) setError('일부 사진을 불러오지 못했습니다.')
      })
      .catch(() => alive && setError('사진을 불러오지 못했습니다.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  function setImages(next: PickedImage[]) {
    setImagesState(next)
    onIdsChange?.(next.map((i) => i.id))
    for (const img of next) {
      if (saved.current.has(img.id)) continue
      saved.current.add(img.id)
      saveImage(img).catch((e) => {
        saved.current.delete(img.id)
        setError(e instanceof Error ? e.message : '사진을 저장하지 못했습니다. 네트워크를 확인해 주세요.')
      })
    }
  }

  return { images, setImages, loading, error }
}
