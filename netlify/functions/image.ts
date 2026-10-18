import { getSnsProfile } from '../../shared/sns'
import { AuthError, requireAdmin } from '../lib/auth'

// 게시물용 이미지 1장을 AI로 만든다. 주소: /.netlify/functions/image
// Netlify 동기 함수 30초 제한 때문에 빠른 품질(low)을 기본으로 쓰고 26초에서 끊는다.
const TIMEOUT_MS = 26_000

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const STYLES: Record<string, string> = {
  photo: '자연광의 실사 사진 느낌, 깔끔한 구도',
  illust: '따뜻한 색감의 플랫 일러스트',
  minimal: '여백이 많은 미니멀한 배경 이미지, 부드러운 색면과 질감',
}

type ImageRequest = { prompt: string; style?: string; snsType?: string; brandName?: string; foodBrand?: boolean }

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: '허용되지 않은 요청입니다.' })
  try {
    await requireAdmin(req)
  } catch (e) {
    return json(401, { error: e instanceof AuthError ? e.message : '로그인을 확인하지 못했습니다.' })
  }

  let input: ImageRequest
  try {
    input = await req.json()
  } catch {
    return json(400, { error: '요청 형식이 올바르지 않습니다.' })
  }
  const prompt = (input.prompt || '').trim()
  if (!prompt) return json(400, { error: '어떤 이미지를 만들지 적어 주세요.' })
  if (prompt.length > 1000) return json(400, { error: '설명은 1000자까지 가능합니다.' })

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_IMAGE_MODEL
  if (!apiKey || !model) {
    return json(500, { error: '서버에 이미지 생성 설정(OPENAI_IMAGE_MODEL)이 없습니다. Netlify 환경변수에 이미지 모델 이름을 넣어 주세요.' })
  }

  // 세로형 SNS는 세로 이미지, 블로그·링크드인·페이스북은 가로 이미지
  const kind = getSnsProfile(input.snsType ?? '')?.value
  const landscape = kind === 'naverblog' || kind === 'linkedin' || kind === 'facebook'
  const dalle = model.startsWith('dall-e')

  const rules = [
    '이미지 안에 글자·숫자·로고·워터마크를 넣지 않는다(글씨는 나중에 따로 얹는다).',
    '실존 인물의 얼굴이나 다른 브랜드 상표를 그리지 않는다.',
    input.foodBrand
      ? '실제 판매 메뉴처럼 보이는 음식 완성 사진은 만들지 않는다. 분위기 배경, 식재료, 식기, 공간, 일러스트 위주로 표현한다.'
      : '',
  ].filter(Boolean)
  const fullPrompt = [`${STYLES[input.style ?? 'photo'] ?? STYLES.photo}.`, prompt, ...rules].join('\n')

  const body: Record<string, unknown> = dalle
    ? { model, prompt: fullPrompt, n: 1, size: landscape ? '1792x1024' : '1024x1792', response_format: 'b64_json' }
    : {
        model,
        prompt: fullPrompt,
        n: 1,
        size: landscape ? '1536x1024' : '1024x1536',
        quality: process.env.OPENAI_IMAGE_QUALITY || 'low',
        output_format: 'jpeg',
        output_compression: 85,
      }

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof Error && e.name === 'TimeoutError'
    return json(504, {
      error: timeout
        ? '이미지 생성이 너무 오래 걸렸습니다. 설명을 짧게 하거나 다시 시도해 주세요.'
        : 'AI 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    })
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('OpenAI 이미지 오류', res.status, detail.slice(0, 500))
    let reason = ''
    try {
      reason = String(JSON.parse(detail)?.error?.message ?? '').slice(0, 300)
    } catch {
      reason = detail.slice(0, 200)
    }
    const message =
      res.status === 400 && /safety|policy|moderation/i.test(reason)
        ? '안전 정책에 걸려 이미지를 만들 수 없습니다. 설명을 바꿔 주세요.'
        : res.status === 403
          ? '이 OpenAI 계정은 이미지 모델을 쓸 수 없습니다. 조직 인증(Verification)이 필요할 수 있습니다.'
          : '이미지를 만들지 못했습니다.'
    return json(502, { error: `${message} (OpenAI ${res.status}${reason ? `: ${reason}` : ''})` })
  }

  try {
    const data = await res.json()
    const b64 = data.data?.[0]?.b64_json
    if (!b64) throw new Error('empty')
    return json(200, { image: `data:image/${dalle ? 'png' : 'jpeg'};base64,${b64}` })
  } catch {
    return json(502, { error: 'AI 이미지 응답을 읽지 못했습니다. 다시 시도해 주세요.' })
  }
}
