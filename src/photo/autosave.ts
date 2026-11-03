import { useEffect, useRef, useState } from 'react'
import type { AiBackground } from '../components/AiBgPanel'
import { composePhoto, fontSpec } from './compose'
import { deleteImage, newDesignId, newImageId, saveAiBackground, saveDesignDoc, saveMask, saveOriginal, type SavedDesign } from './designs'
import { getEditor, patchDoc, type DesignState, type EditorDoc } from './editorStore'

export type SaveState = { state: 'idle' | 'pending' | 'saving' | 'saved' | 'error'; savedAt: Date | null; message: string | null }

const DELAY_MS = 1200
const THUMB_SIDE = 360

/**
 * 편집기 자동 저장: 배경을 지운 뒤부터, 손을 멈추고 1.2초 뒤 내 디자인에 저장한다.
 * 처음 저장할 때 원본·마스크를 올리고, AI 배경은 처음 쓸 때 한 번 올린다.
 */
export function useDesignAutosave(doc: EditorDoc | null, design: DesignState) {
  const [status, setStatus] = useState<SaveState>({ state: 'idle', savedAt: null, message: null })
  const running = useRef(false)
  const again = useRef(false)
  const lastSig = useRef('')
  const timer = useRef<number | undefined>(undefined)
  const [retry, setRetry] = useState(0)

  const ready = !!doc?.cutout
  const sig = ready ? JSON.stringify([doc!.title, design]) : ''

  useEffect(() => {
    if (!ready || sig === lastSig.current) return
    setStatus((s) => ({ ...s, state: 'pending' }))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(run, DELAY_MS)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ready, retry])

  // 저장 전에 창을 닫으면 경고
  useEffect(() => {
    if (status.state !== 'pending' && status.state !== 'saving') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status.state])

  async function run() {
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setStatus((s) => ({ ...s, state: 'saving', message: null }))
    // 저장하는 동안 바뀐 내용은 끝나고 한 번 더 저장
    const { doc: cur, design: d } = getEditor()
    const mySig = cur?.cutout ? JSON.stringify([cur.title, d]) : ''
    try {
      if (!cur?.cutout) return
      await saveOnce(cur, d, getEditor().aiBgs)
      lastSig.current = mySig
      setStatus({ state: 'saved', savedAt: new Date(), message: null })
    } catch (e) {
      console.error('디자인 저장 실패', e)
      setStatus((s) => ({ ...s, state: 'error', message: e instanceof Error ? e.message : '저장하지 못했습니다.' }))
    } finally {
      running.current = false
      if (again.current) {
        again.current = false
        void run()
      }
    }
  }

  return { status, retry: () => setRetry((n) => n + 1), saveNow: run }
}

async function saveOnce(cur: EditorDoc, d: DesignState, aiBgs: AiBackground[]) {
  const cutout = cur.cutout!
  const isNew = !cur.designId
  let ids = { designId: cur.designId, originalId: cur.originalId, maskId: cur.maskId }
  if (isNew) {
    ids = { designId: newDesignId(), originalId: newImageId(), maskId: newImageId() }
    await saveOriginal(ids.originalId!, cur.original.el)
    await saveMask(ids.maskId!, cutout, cur.original.el.naturalWidth, cur.original.el.naturalHeight)
    patchDoc(ids)
  }

  // AI 배경: 이 디자인에 처음 쓰는 배경이면 올린다
  // AI 배경·내 사진 배경: 고른 종류와 맞는 것만
  const kind = d.settings.bg === 'ai' || d.settings.bg === 'image' ? d.settings.bg : null
  const bg = kind ? aiBgs.find((b) => b.id === d.aiBgId && (b.kind ?? 'ai') === kind) ?? null : null
  let stored = getEditor().doc?.storedBgs ?? {}
  let aiBg: SavedDesign['aiBg'] = null
  if (bg) {
    let id = stored[bg.id]
    if (!id) {
      id = newImageId()
      await saveAiBackground(id, bg.el)
      stored = { ...stored, [bg.id]: id }
      patchDoc({ storedBgs: stored })
    }
    aiBg = { id, prompt: bg.prompt, kind: bg.kind ?? 'ai' }
  }

  await saveDesignDoc(
    ids.designId!,
    {
      title: cur.title.trim() || '상품 사진',
      originalId: ids.originalId!,
      maskId: ids.maskId!,
      aiBg,
      settings: d.settings,
      transform: d.transform,
      texts: d.texts,
      thumbnail: await thumbnail(cur, d, bg?.el ?? null),
    },
    isNew,
  )

  // 지금 쓰지 않는 AI 배경 사본은 지운다
  const keep = aiBg?.id
  const unused = Object.entries(stored).filter(([, id]) => id !== keep)
  if (unused.length) {
    for (const [, id] of unused) await deleteImage(id)
    patchDoc({ storedBgs: Object.fromEntries(Object.entries(stored).filter(([, id]) => id === keep)) })
  }
}

/** 목록용 작은 미리보기 (글자 포함) */
async function thumbnail(cur: EditorDoc, d: DesignState, background: HTMLImageElement | null) {
  await Promise.all(d.texts.map((t) => document.fonts.load(fontSpec(t, 40), t.text || ' ').catch(() => null)))
  const full = document.createElement('canvas')
  composePhoto(full, { original: cur.original.el, cutout: cur.cutout!, background }, d.settings, { transform: d.transform, texts: d.texts }, { maxSide: THUMB_SIDE * 2 })
  const k = Math.min(1, THUMB_SIDE / Math.max(full.width, full.height))
  const c = document.createElement('canvas')
  c.width = Math.round(full.width * k)
  c.height = Math.round(full.height * k)
  const ctx = c.getContext('2d')!
  // 투명 배경은 목록에서 체크무늬 대신 흰색으로
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(full, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.75)
}

