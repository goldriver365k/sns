import { AuthError, requireAdmin } from '../lib/auth'

// 배경용 무료 사진 찾기·받기. 주소: /.netlify/functions/bg-search
// Openverse(가입·키 없음)에서 저작권 표시가 필요 없는 공개 사진(CC0·퍼블릭 도메인)만 찾는다 → 상업 이용 가능.
// 사진은 이 함수가 대신 받아 돌려준다(다른 사이트 사진을 캔버스에 그리면 저장이 막히기 때문).
const API = 'https://api.openverse.org/v1/images'
const UA = 'SNSROOM/1.0 (private admin tool)'
const ALLOWED = new Set(['cc0', 'pdm'])
// 함수 응답 6MB 제한 안에 들도록(base64는 약 1.33배)
const MAX_BYTES = 4_000_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

type OvImage = { id: string; title?: string; url: string; thumbnail?: string; creator?: string; source?: string; provider?: string; license: string; foreign_landing_url?: string; width?: number; height?: number; filesize?: number }

async function getJson(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) })
  if (!res.ok) throw new Error(`Openverse ${res.status}`)
  return res.json()
}

async function download(url: string) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000), redirect: 'follow' })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.length <= MAX_BYTES ? { data: buf.toString('base64'), mime: type.split(';')[0] } : null
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }
  let input: { q?: string; page?: number; imageId?: string }
  try {
    input = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }

  try {
    // 고른 사진 받기
    if (input.imageId) {
      const id = String(input.imageId)
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: '사진 번호가 올바르지 않습니다.' })
      const item = (await getJson(`${API}/${id}/`)) as OvImage
      if (!ALLOWED.has(item.license)) return json(400, { error: '공개 사진(CC0)이 아니어서 쓸 수 없습니다.' })
      // 원본 → (원본 사이트가 거절하면) Openverse가 대신 주는 원본 크기 그림 → 작은 그림 순서
      const file = (await download(item.url)) ?? (await download(`${API}/${id}/thumb/?full_size=true`)) ?? (await download(`${API}/${id}/thumb/`))
      if (!file) return json(502, { error: '사진을 받지 못했습니다. 다른 사진을 골라 주세요.' })
      return json(200, { ...file, title: item.title ?? '', creator: item.creator ?? '', source: item.source ?? item.provider ?? '', license: item.license, landing: item.foreign_landing_url ?? '' })
    }

    // 찾기
    const q = String(input.q ?? '').trim().slice(0, 100)
    if (!q) return json(400, { error: '찾을 말을 입력해 주세요.' })
    const page = Math.min(10, Math.max(1, Math.round(Number(input.page) || 1)))
    const params = new URLSearchParams({ q, license: 'cc0,pdm', page_size: '24', page: String(page), mature: 'false', category: 'photograph' })
    const data = (await getJson(`${API}/?${params}`)) as { result_count?: number; results?: OvImage[] }
    const results = (data.results ?? [])
      .filter((r) => ALLOWED.has(r.license))
      .map((r) => ({ id: r.id, title: r.title ?? '', thumb: `${API}/${r.id}/thumb/`, creator: r.creator ?? '', source: r.source ?? r.provider ?? '', width: r.width ?? 0, height: r.height ?? 0 }))
    return json(200, { total: data.result_count ?? results.length, results })
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    console.error('배경 사진 찾기 오류', e)
    return json(502, { error: timeout ? '사진 찾기 응답이 너무 늦습니다. 다시 시도해 주세요.' : '무료 사진 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
  }
}
