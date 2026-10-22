import { useEffect, useRef, useState } from 'react'
import ReelPreview from '../../components/reels/ReelPreview'
import Timeline from '../../components/reels/Timeline'
import SceneInspector from '../../components/reels/SceneInspector'
import AssetPanel from '../../components/reels/AssetPanel'
import ExportPanel from '../../components/reels/ExportPanel'
import SoundPanel from '../../components/reels/SoundPanel'
import OtherDesigns from '../../components/reels/OtherDesigns'
import ReelCaption from '../../components/reels/ReelCaption'
import { useReelAudio } from '../../reels/previewAudio'
import { blankScene, getProject, newSceneId, updateProject, useReelProject } from '../../reels/store'
import { useReelPlayer } from '../../reels/player'
import { useSaveStatus } from '../../reels/persist'
import { maxScenesFor, scenesFromAi, splitScript } from '../../reels/storyboard'
import { loadAiSettings, runReelScript } from '../../reels/ai'
import { useChannels } from '../../lib/channels'
import type { ReelScriptBrand } from '../../../shared/reelScript'
import { REEL_TEMPLATES } from '../../reels/templates'
import type { ReelDuration, ReelProject, ReelScene } from '../../reels/types'

const DURATIONS: ReelDuration[] = [10, 15, 30, 60]
const box = 'rounded-2xl border border-cream-300 bg-cream-50 p-4'
const heading = 'mb-2 text-sm font-bold text-forest-900'
const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'

/** 자동 릴스 제작 화면: 왼쪽 설정 / 가운데 9:16 미리보기 / 오른쪽 실행 / 아래 타임라인 */
export default function ReelStudio() {
  const p = useReelProject()
  const player = useReelPlayer(p.duration)
  useReelAudio(p, player)
  const [selected, setSelected] = useState<string | null>(p.scenes[0]?.id ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  const scene = p.scenes.find((s) => s.id === selected) ?? p.scenes[0]
  const media = p.assets.filter((a) => a.kind === 'media')
  const { loading } = useSaveStatus()
  const { channels } = useChannels()
  const [aiBusy, setAiBusy] = useState<'topic' | 'rewrite' | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  /** AI로 바꾸기 전 상태 — [되돌리기]용 */
  const [undo, setUndo] = useState<Pick<ReelProject, 'title' | 'script' | 'scenes'> | null>(null)
  const brand = channels.find((c) => c.id === p.brandId) ?? null
  const brandInfo: ReelScriptBrand | null = brand ? { name: brand.name, siteUrl: brand.siteUrl, description: brand.description, rules: brand.rules } : null
  const aiLabel = loadAiSettings().provider === 'local' ? '로컬 AI' : '서버 AI'

  async function runAi(mode: 'topic' | 'rewrite') {
    setAiError(null)
    setNotice(null)
    if (mode === 'topic' && !p.topic.trim()) return setAiError('주제를 먼저 적어 주세요.')
    if (mode === 'rewrite' && !p.script.trim()) return setAiError('다듬을 글을 대본 칸에 붙여넣어 주세요.')
    setAiBusy(mode)
    try {
      const r = await runReelScript({ mode, topic: p.topic, source: p.script, duration: p.duration, brand: brandInfo })
      const cur = getProject()
      setUndo({ title: cur.title, script: cur.script, scenes: cur.scenes })
      const scenes = scenesFromAi(r.scenes, cur.assets.filter((a) => a.kind === 'media'))
      updateProject({
        scenes,
        script: r.scenes.map((x) => x.text.replace(/\n/g, ' ')).join('\n'),
        title: !cur.title.trim() || cur.title === '새 릴스' ? r.title || cur.title : cur.title,
      })
      setSelected(scenes[0].id)
      player.setRange(null)
      player.seek(0)
      setNotice(`${aiLabel}가 장면 ${scenes.length}개를 만들었습니다. 자막·효과는 아래에서 고칠 수 있습니다.`)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI 대본을 만들지 못했습니다.')
    } finally {
      setAiBusy(null)
    }
  }

  function restore() {
    if (!undo) return
    updateProject(undo)
    setSelected(undo.scenes[0]?.id ?? null)
    setUndo(null)
    setNotice('AI로 바꾸기 전으로 되돌렸습니다.')
  }

  // 다른 프로젝트를 열거나 새로 시작하면 처음 장면부터 (처음 저장되며 id가 생길 때는 그대로)
  const prevId = useRef(p.id)
  useEffect(() => {
    const prev = prevId.current
    prevId.current = p.id
    if (prev === p.id || (prev === null && p.id !== null && !loading)) return
    setSelected(p.scenes[0]?.id ?? null)
    setNotice(null)
    setUndo(null)
    setAiError(null)
    player.setRange(null)
    player.seek(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id])

  function patchScene(id: string, patch: Partial<ReelScene>) {
    updateProject((cur) => ({ scenes: cur.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }

  function makeScenes() {
    const scenes = splitScript(p.script, media, maxScenesFor(p.duration))
    if (!scenes.length) {
      setNotice('대본을 먼저 입력해 주세요.')
      return
    }
    updateProject({ scenes })
    setSelected(scenes[0].id)
    player.setRange(null)
    player.seek(0)
    setNotice(`대본을 장면 ${scenes.length}개로 나눴습니다. 사진·영상은 순서대로 배정했습니다.`)
  }

  function move(from: number, to: number) {
    updateProject((cur) => {
      const list = [...cur.scenes]
      const [item] = list.splice(from, 1)
      list.splice(to, 0, item)
      return { scenes: list }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_240px]">
        {/* 왼쪽: 설정 */}
        <aside className="order-3 space-y-4 lg:order-1">
          <section className={box}>
            <h2 className={heading}>주제·대본</h2>
            <label className="mb-1 block text-xs text-muted" htmlFor="rl-title">제목 (정보·프리미엄 디자인 위쪽에 표시)</label>
            <input id="rl-title" value={p.title} onChange={(e) => updateProject({ title: e.target.value })} className={`${field} mb-2`} maxLength={40} />
            <label className="mb-1 block text-xs text-muted" htmlFor="rl-brand">브랜드 (선택 — AI 대본에 사이트·규칙 반영)</label>
            <select id="rl-brand" value={p.brandId ?? ''} onChange={(e) => updateProject({ brandId: e.target.value || null })} className={`${field} mb-2`}>
              <option value="">선택 안 함</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="mb-1 block text-xs text-muted" htmlFor="rl-topic">주제 한 줄</label>
            <input id="rl-topic" value={p.topic} onChange={(e) => updateProject({ topic: e.target.value })} className={`${field} mb-2`} placeholder="예) 화산불백 점심 세트 9,900원 소개" maxLength={200} />
            <button onClick={() => runAi('topic')} disabled={!!aiBusy} className="mb-1 w-full rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-900 disabled:opacity-60">
              {aiBusy === 'topic' ? `${aiLabel}가 대본 쓰는 중…` : `✨ 주제로 AI 대본·장면 만들기 (${p.duration}초)`}
            </button>
            <p className="mb-3 text-[11px] text-muted">가격은 주제에 적은 것만 씁니다. AI 연결은 설정 탭에서 바꿉니다({aiLabel} 사용 중).</p>
            <label className="mb-1 block text-xs text-muted" htmlFor="rl-script">대본 (한 줄 = 한 장면)</label>
            <textarea
              id="rl-script"
              rows={6}
              value={p.script}
              onChange={(e) => updateProject({ script: e.target.value })}
              className={`${field} resize-y`}
              placeholder={'점심 고민 끝!\n불로 굽고 밥으로 완성한 불백\n오늘만 9,900원\n지금 bulbaek.com에서 확인하세요'}
              maxLength={3000}
            />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button onClick={makeScenes} disabled={!!aiBusy} className="rounded-xl border border-forest-700 bg-white py-2.5 text-sm font-semibold text-forest-700 hover:bg-cream-100 disabled:opacity-60">
                장면 나누기
              </button>
              <button onClick={() => runAi('rewrite')} disabled={!!aiBusy} className="rounded-xl border border-forest-700 bg-white py-2.5 text-sm font-semibold text-forest-700 hover:bg-cream-100 disabled:opacity-60">
                {aiBusy === 'rewrite' ? '다듬는 중…' : '✨ AI로 다듬기'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">[장면 나누기]는 쓴 그대로 나누고, [AI로 다듬기]는 붙여넣은 글을 릴스용 대본으로 다시 씁니다.</p>
            {aiError && <p className="mt-2 text-xs text-red-700">{aiError}</p>}
            {notice && <p className="mt-2 text-xs text-forest-700">{notice}</p>}
            {undo && (
              <button onClick={restore} className="mt-1 text-xs font-medium text-forest-500 underline">
                ↩ AI로 바꾸기 전으로 되돌리기
              </button>
            )}
          </section>

          <section className={box}>
            <h2 className={heading}>영상 길이</h2>
            <div className="grid grid-cols-4 gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d} onClick={() => updateProject({ duration: d })} aria-pressed={p.duration === d} className={`rounded-lg border py-2 text-sm ${p.duration === d ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}>
                  {d}초
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">장면 길이는 비율대로 다시 나뉩니다.</p>
          </section>

          <section className={box}>
            <h2 className={heading}>디자인</h2>
            <div className="mb-1 text-[11px] font-medium text-muted">사진 릴스 (지금 화면)</div>
            <div className="grid grid-cols-5 gap-1">
              {REEL_TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => updateProject({ template: t.id })} aria-pressed={p.template === t.id} title={t.description} className={`rounded-lg border px-1 py-2 text-xs ${p.template === t.id ? 'border-forest-700 bg-forest-700 text-cream-50' : 'border-cream-300 bg-white'}`}>
                  {t.name}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={p.showProgress} onChange={(e) => updateProject({ showProgress: e.target.checked })} className="accent-forest-700" />
              아래 진행 막대 표시
            </label>
            <OtherDesigns project={p} brandName={brand?.name} />
          </section>

          <section className={box}>
            <h2 className={heading}>목소리·배경음악</h2>
            <SoundPanel project={p} />
          </section>

          <section className={box}>
            <h2 className={heading}>자료 (사진·영상·로고·캐릭터)</h2>
            <AssetPanel
              project={p}
              onChange={updateProject}
              onAdd={(added) =>
                updateProject((cur) => {
                  // 사진이 없는 장면부터 새 사진·영상을 채워 준다
                  const queue = added.filter((a) => a.kind === 'media')
                  const scenes = cur.scenes.map((s) => (!s.assetId && queue.length ? { ...s, assetId: queue.shift()!.id } : s))
                  const logo = added.find((a) => a.kind === 'logo')
                  return { assets: [...cur.assets, ...added], scenes, logoId: logo ? logo.id : cur.logoId }
                })
              }
            />
          </section>
        </aside>

        {/* 가운데: 미리보기 */}
        <section className="order-1 flex flex-col items-center lg:order-2">
          <div className="relative w-full max-w-[260px] sm:max-w-[380px]">
            <ReelPreview project={p} player={player} />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/55 text-sm font-medium text-white">프로젝트를 불러오는 중…</div>
            )}
          </div>
        </section>

        {/* 오른쪽: 실행 */}
        <aside className="order-2 space-y-3 lg:order-3">
          <section className={box}>
            <h2 className={heading}>미리보기</h2>
            <div className="flex gap-2">
              <button onClick={() => (player.playing ? player.pause() : player.play())} className="flex-1 rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-900">
                {player.playing ? '❚❚ 일시정지' : '▶ 재생'}
              </button>
              <button
                onClick={() => {
                  player.setRange(null)
                  player.seek(0)
                }}
                className="rounded-xl border border-cream-300 bg-white px-3 text-sm"
                aria-label="처음으로"
              >
                ⏮
              </button>
            </div>
            {player.range && <p className="mt-2 text-xs text-forest-700">선택한 장면만 반복 재생 중</p>}
            <p className="mt-2 text-[11px] text-muted">미리보기는 1080×1920 실제 크기로 그린 화면을 줄여 보여 줍니다. 목소리·배경음악이 켜져 있으면 함께 들립니다(넣은 영상 자체의 소리는 쓰지 않음).</p>
          </section>
          <ExportPanel project={p} player={player} />
          <ReelCaption brandName={brand?.name} topic={p.topic} content={p.scenes.map((s) => s.text.replace(/\n/g, ' ')).join('\n')} value={p.caption} onChange={(v) => updateProject({ caption: v })} />
        </aside>
      </div>

      {/* 아래: 타임라인 + 장면 설정 */}
      <section className={box}>
        <Timeline
          project={p}
          player={player}
          selected={scene?.id ?? null}
          onSelect={setSelected}
          onReorder={move}
          onAdd={() => {
            const s = { ...blankScene('새 장면 자막'), assetId: media[p.scenes.length % Math.max(1, media.length)]?.id ?? null }
            updateProject((cur) => ({ scenes: [...cur.scenes, s] }))
            setSelected(s.id)
          }}
        />
        {scene && (
          <div className="mt-4 border-t border-cream-300 pt-4">
            <SceneInspector
              project={p}
              brand={brandInfo}
              scene={scene}
              player={player}
              onChange={(patch) => patchScene(scene.id, patch)}
              onMove={(dir) => {
                const i = p.scenes.findIndex((s) => s.id === scene.id)
                move(i, i + dir)
              }}
              onDuplicate={() => {
                const i = p.scenes.findIndex((s) => s.id === scene.id)
                const copy = { ...scene, id: newSceneId(), effects: [...scene.effects] }
                updateProject((cur) => {
                  const list = [...cur.scenes]
                  list.splice(i + 1, 0, copy)
                  return { scenes: list }
                })
                setSelected(copy.id)
              }}
              onDelete={() => {
                const i = p.scenes.findIndex((s) => s.id === scene.id)
                updateProject((cur) => ({ scenes: cur.scenes.filter((s) => s.id !== scene.id) }))
                setSelected(p.scenes[i + 1]?.id ?? p.scenes[i - 1]?.id ?? null)
                player.setRange(null)
              }}
            />
          </div>
        )}
      </section>
    </div>
  )
}
