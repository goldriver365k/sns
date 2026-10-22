import { useState } from 'react'
import { DEFAULT_AI, listLocalModels, loadAiSettings, saveAiSettings, type AiSettings } from '../../reels/ai'

const box = 'rounded-2xl border border-cream-300 bg-cream-50 p-5'
const field = 'w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-500'

/** 릴스 설정: AI 대본 연결 (서버 OpenAI / 로컬 AI) */
export default function ReelSettings() {
  const [s, setS] = useState<AiSettings>(loadAiSettings)
  const [models, setModels] = useState<string[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function update(patch: Partial<AiSettings>) {
    const next = { ...s, ...patch }
    setS(next)
    saveAiSettings(next)
  }

  async function check() {
    setChecking(true)
    setMsg(null)
    try {
      const list = await listLocalModels(s.localUrl)
      setModels(list)
      if (!list.length) setMsg({ ok: false, text: '연결은 됐지만 설치된 모델이 없습니다. 로컬 AI 프로그램에서 모델을 먼저 받아 주세요.' })
      else {
        setMsg({ ok: true, text: `연결됨 · 모델 ${list.length}개` })
        if (!list.includes(s.localModel)) update({ localModel: list[0] })
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '연결하지 못했습니다.' })
    } finally {
      setChecking(false)
    }
  }

  const origin = typeof location !== 'undefined' ? location.origin : 'https://snsroom.netlify.app'

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className={box}>
        <h2 className="text-base font-bold text-forest-900">AI 대본 연결</h2>
        <p className="mt-1 text-sm text-muted">자동 릴스의 [AI로 대본 만들기]·[AI로 다듬기]·[이 장면 AI로 다시 쓰기]에 쓸 AI를 고릅니다. 이 설정은 지금 쓰는 기기에만 저장됩니다.</p>

        <div className="mt-4 space-y-2">
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${s.provider === 'server' ? 'border-forest-700 bg-white' : 'border-cream-300'}`}>
            <input type="radio" name="ai" checked={s.provider === 'server'} onChange={() => update({ provider: 'server' })} className="mt-1 accent-forest-700" />
            <span>
              <span className="block text-sm font-semibold text-forest-900">서버 AI (OpenAI) — 기본</span>
              <span className="block text-xs text-muted">Netlify 환경변수의 OpenAI 키로 서버에서 만듭니다. 키는 브라우저에 보이지 않습니다. 연결 상태는 운영 설정 → 서버 연결 점검에서 확인합니다.</span>
            </span>
          </label>
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${s.provider === 'local' ? 'border-forest-700 bg-white' : 'border-cream-300'}`}>
            <input type="radio" name="ai" checked={s.provider === 'local'} onChange={() => update({ provider: 'local' })} className="mt-1 accent-forest-700" />
            <span>
              <span className="block text-sm font-semibold text-forest-900">로컬 AI (이 PC에서 실행)</span>
              <span className="block text-xs text-muted">Ollama·LM Studio처럼 PC에 설치한 AI를 씁니다. 사용료가 없고 글이 밖으로 나가지 않지만, PC 성능에 따라 느리고 품질이 모델마다 다릅니다.</span>
            </span>
          </label>
        </div>

        {s.provider === 'local' && (
          <div className="mt-4 space-y-3 rounded-xl border border-cream-300 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="ai-url">로컬 AI 주소</label>
              <div className="flex gap-2">
                <input id="ai-url" value={s.localUrl} onChange={(e) => update({ localUrl: e.target.value })} className={field} placeholder={DEFAULT_AI.localUrl} />
                <button onClick={check} disabled={checking} className="shrink-0 rounded-lg bg-forest-700 px-3 text-sm font-semibold text-cream-50 disabled:opacity-60">
                  {checking ? '확인 중…' : '연결 확인'}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted">Ollama: http://localhost:11434 · LM Studio: http://localhost:1234</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted" htmlFor="ai-model">모델</label>
              {models?.length ? (
                <select id="ai-model" value={s.localModel} onChange={(e) => update({ localModel: e.target.value })} className={field}>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input id="ai-model" value={s.localModel} onChange={(e) => update({ localModel: e.target.value })} className={field} placeholder="[연결 확인]을 누르면 목록이 나옵니다" />
              )}
            </div>
            {msg && <p className={`text-xs ${msg.ok ? 'text-forest-700' : 'text-red-700'}`}>{msg.text}</p>}
          </div>
        )}
      </section>

      <aside className="space-y-4">
        {s.provider === 'local' && (
          <section className="rounded-2xl border border-cream-300 bg-white p-4 text-xs leading-relaxed text-muted">
            <div className="mb-1 font-semibold text-forest-900">로컬 AI 준비 (한 번만)</div>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                <b>Ollama</b>: 설치 후 환경변수 <code className="rounded bg-cream-100 px-1">OLLAMA_ORIGINS={origin}</code> 를 넣고 다시 실행, 한국어가 되는 모델을 받습니다.
              </li>
              <li>
                <b>LM Studio</b>: Developer → 서버 켜기, 설정에서 <b>CORS 허용</b>을 켭니다.
              </li>
              <li>브라우저가 "로컬 네트워크 접근"을 물으면 허용합니다.</li>
              <li>모델마다 라이선스(상업 이용 조건)가 다릅니다. 받기 전에 모델 안내 페이지에서 확인해 주세요.</li>
            </ol>
          </section>
        )}
        <section className="rounded-2xl border border-dashed border-cream-300 p-4 text-xs leading-relaxed text-muted">
          <div className="mb-1 font-semibold text-forest-900">다음 단계에서 추가</div>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>기본 목소리·말하기 속도</li>
            <li>기본 배경음악과 음량</li>
            <li>기본 디자인·영상 길이</li>
          </ul>
        </section>
      </aside>
    </div>
  )
}
