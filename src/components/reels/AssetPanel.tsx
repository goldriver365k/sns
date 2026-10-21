import { useEffect, useRef, useState } from 'react'
import { loadAsset, releaseAsset } from '../../reels/assets'
import type { AssetKind, ReelAsset, ReelProject } from '../../reels/types'

type Props = {
  project: ReelProject
  onAdd: (assets: ReelAsset[]) => void
  onChange: (patch: Partial<ReelProject>) => void
}

const KIND_LABEL: Record<AssetKind, string> = { media: '사진·영상', logo: '로고', character: '캐릭터' }
const MAX_ASSETS = 30

/** 자료 넣기: 파일 선택·끌어다 놓기·붙여넣기(Ctrl+V). 사진·영상 / 로고 / 캐릭터 */
export default function AssetPanel({ project, onAdd, onChange }: Props) {
  const inputs = { media: useRef<HTMLInputElement>(null), logo: useRef<HTMLInputElement>(null), character: useRef<HTMLInputElement>(null) }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const countRef = useRef(project.assets.length)
  countRef.current = project.assets.length

  async function add(files: File[], kind: AssetKind) {
    setError(null)
    if (countRef.current + files.length > MAX_ASSETS) {
      setError(`자료는 ${MAX_ASSETS}개까지 넣을 수 있습니다.`)
      files = files.slice(0, Math.max(0, MAX_ASSETS - countRef.current))
    }
    setBusy(true)
    const added: ReelAsset[] = []
    for (const f of files) {
      try {
        added.push(await loadAsset(f, kind))
      } catch (e) {
        setError(e instanceof Error ? e.message : '파일을 넣지 못했습니다.')
      }
    }
    setBusy(false)
    if (added.length) onAdd(added)
  }

  // 화면 어디서든 붙여넣은 사진·영상은 사진·영상 자료로 추가 (글자 붙여넣기는 그대로)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      if (!files.length) return
      e.preventDefault()
      add(files, 'media')
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remove(a: ReelAsset) {
    releaseAsset(a)
    onChange({
      assets: project.assets.filter((x) => x.id !== a.id),
      logoId: project.logoId === a.id ? null : project.logoId,
      scenes: project.scenes.map((s) => ({ ...s, assetId: s.assetId === a.id ? null : s.assetId, characterId: s.characterId === a.id ? null : s.characterId })),
    })
  }

  function toggleKeyModel(a: ReelAsset) {
    onChange({ assets: project.assets.map((x) => (x.id === a.id ? { ...x, keyModel: !x.keyModel } : x)) })
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add([...e.dataTransfer.files], 'media')
        }}
        className={`rounded-xl border-2 border-dashed p-3 text-center ${drag ? 'border-forest-500 bg-forest-50' : 'border-cream-300 bg-white'}`}
      >
        <p className="text-xs text-muted">{busy ? '불러오는 중…' : '끌어다 놓거나 Ctrl+V로 붙여넣기'}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => (
            <button key={k} onClick={() => inputs[k].current?.click()} className="rounded-lg border border-cream-300 bg-cream-50 px-2.5 py-1.5 text-xs font-medium text-forest-700 hover:border-forest-500">
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => (
          <input
            key={k}
            ref={inputs[k]}
            type="file"
            hidden
            multiple={k !== 'logo'}
            accept={k === 'media' ? 'image/*,video/*' : 'image/*'}
            aria-label={`${KIND_LABEL[k]} 파일`}
            onChange={(e) => {
              add([...(e.target.files ?? [])], k)
              e.target.value = ''
            }}
          />
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

      {project.assets.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-1.5">
          {project.assets.map((a) => (
            <li key={a.id} className="relative overflow-hidden rounded-lg border border-cream-300 bg-cream-100">
              {a.type === 'image' ? (
                <img src={a.url} alt={a.name} className={`aspect-[9/12] w-full ${a.kind === 'media' ? 'object-cover' : 'object-contain p-1'}`} />
              ) : (
                <video src={a.url} muted className="aspect-[9/12] w-full object-cover" />
              )}
              <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                {a.kind === 'media' ? (a.type === 'video' ? `영상 ${Math.round(a.duration ?? 0)}초` : '사진') : KIND_LABEL[a.kind]}
              </span>
              <button onClick={() => remove(a)} aria-label={`${a.name} 빼기`} className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-red-600">×</button>
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/45 py-0.5">
                {a.kind === 'media' && a.type === 'image' && (
                  <button onClick={() => toggleKeyModel(a)} aria-pressed={!!a.keyModel} title="핵심 모델: 자르지 않고 원본 그대로 보여 줌" className={`text-[10px] ${a.keyModel ? 'text-yellow-300' : 'text-white'}`}>
                    {a.keyModel ? '★ 원본 유지' : '☆ 핵심 모델'}
                  </button>
                )}
                {a.kind === 'logo' && (
                  <button onClick={() => onChange({ logoId: project.logoId === a.id ? null : a.id })} aria-pressed={project.logoId === a.id} className={`text-[10px] ${project.logoId === a.id ? 'text-yellow-300' : 'text-white'}`}>
                    {project.logoId === a.id ? '● 표시 중' : '○ 표시하기'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] leading-snug text-muted">★ 핵심 모델로 지정한 사진은 자르거나 크게 확대하지 않고 원본 그대로 보여 줍니다. 자료는 지금 이 브라우저에서만 쓰이며 새로고침하면 사라집니다(프로젝트 저장은 다음 단계).</p>
    </div>
  )
}
