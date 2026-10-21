import { useState } from 'react'
import ReelPreview from '../../components/reels/ReelPreview'
import Timeline from '../../components/reels/Timeline'
import SceneInspector from '../../components/reels/SceneInspector'
import AssetPanel from '../../components/reels/AssetPanel'
import ExportPanel from '../../components/reels/ExportPanel'
import { blankScene, newSceneId, updateProject, useReelProject } from '../../reels/store'
import { useReelPlayer } from '../../reels/player'
import { maxScenesFor, splitScript } from '../../reels/storyboard'
import { REEL_TEMPLATES } from '../../reels/templates'
import type { ReelDuration, ReelScene } from '../../reels/types'

const DURATIONS: ReelDuration[] = [10, 15, 30, 60]
const box = 'rounded-2xl border border-cream-300 bg-cream-50 p-4'
const heading = 'mb-2 text-sm font-bold text-forest-900'
const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'

/** 자동 릴스 제작 화면: 왼쪽 설정 / 가운데 9:16 미리보기 / 오른쪽 실행 / 아래 타임라인 */
export default function ReelStudio() {
  const p = useReelProject()
  const player = useReelPlayer(p.duration)
  const [selected, setSelected] = useState<string | null>(p.scenes[0]?.id ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  const scene = p.scenes.find((s) => s.id === selected) ?? p.scenes[0]
  const media = p.assets.filter((a) => a.kind === 'media')

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
            <label className="mb-1 block text-xs text-muted" htmlFor="rl-topic">주제 한 줄</label>
            <input id="rl-topic" value={p.topic} onChange={(e) => updateProject({ topic: e.target.value })} className={`${field} mb-1`} placeholder="예) 화산불백 점심 세트 소개" maxLength={200} />
            <p className="mb-2 text-[11px] text-muted">주제로 대본을 자동으로 쓰는 기능(AI)은 다음 단계에서 연결합니다. 지금은 아래에 대본을 직접 쓰거나 붙여넣어 주세요.</p>
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
            <button onClick={makeScenes} className="mt-2 w-full rounded-xl bg-forest-700 py-2.5 text-sm font-semibold text-cream-50 hover:bg-forest-900">
              장면 나누기
            </button>
            {notice && <p className="mt-2 text-xs text-forest-700">{notice}</p>}
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
          <div className="w-full max-w-[260px] sm:max-w-[380px]">
            <ReelPreview project={p} player={player} />
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
            <p className="mt-2 text-[11px] text-muted">미리보기는 1080×1920 실제 크기로 그린 화면을 줄여 보여 줍니다. 영상은 소리 없이 재생됩니다.</p>
          </section>
          <ExportPanel project={p} player={player} />
          <section className="rounded-2xl border border-dashed border-cream-300 p-4 text-xs leading-relaxed text-muted">
            <div className="mb-1 font-semibold text-forest-900">다음 단계에서 추가</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>AI 대본·장면 자동 생성, 붙여넣은 글 AI 재작성</li>
              <li>한국어 AI 목소리(속도 조절·미리 듣기)</li>
              <li>배경음악·음량·나레이션 중 자동 감소</li>
              <li>목소리와 맞춘 자동 자막</li>
              <li>장면 AI 재생성</li>
              <li>프로젝트 자동 저장·다시 편집</li>
            </ul>
          </section>
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
