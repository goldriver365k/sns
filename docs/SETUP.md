# 설정 안내 (사용자가 직접 할 일)

> 기존에 운영 중인 Firebase 프로젝트와 Netlify 사이트는 **건드리지 않습니다.** 아래는 모두 이 프로젝트 전용으로 **새로 만드는** 작업입니다.

## 1. 새 Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 프로젝트 이름: 예) `ai-content-manager` (기존 프로젝트를 선택하지 말고 새로 만듭니다)
3. Google 애널리틱스는 **사용 안 함**으로 해도 됩니다.

### 1-1. 웹 앱 등록
1. 프로젝트 개요 화면에서 **웹(</>) 아이콘** → 앱 닉네임 `web` → 등록 (Firebase Hosting 체크는 하지 않음)
2. 화면에 나오는 `firebaseConfig`의 6개 값(apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)을 복사해 둡니다.
   - 이 값들은 공개되어도 되는 식별자입니다. 채팅으로 알려 주셔도 괜찮습니다.

### 1-2. Google 로그인 켜기
1. 왼쪽 **빌드 → Authentication → 시작하기**
2. **로그인 방법 → Google → 사용 설정** → 지원 이메일 선택 → 저장
3. **설정 → 승인된 도메인**에 나중에 만들 Netlify 주소(예: `xxx.netlify.app`)를 추가합니다. (`localhost`는 기본 포함)

### 1-3. Firestore 만들기
1. **빌드 → Firestore Database → 데이터베이스 만들기**
2. 위치: `asia-northeast3 (서울)` 권장 → **프로덕션 모드**로 시작
3. **규칙** 탭에 저장소의 `firestore.rules` 내용을 붙여넣고 **게시**

### 1-4. Storage 만들기
1. **빌드 → Storage → 시작하기**
   - 2024년 10월 이후 새 프로젝트는 Storage 사용에 **Blaze(종량제) 요금제**가 필요할 수 있습니다. 이 경우 진행 전에 알려 주세요. 소량 사용은 무료 한도 안에서 처리되는 경우가 많지만, 결제 수단 등록이 필요합니다.
2. 위치는 Firestore와 같은 지역 → **규칙** 탭에 `storage.rules` 내용을 붙여넣고 **게시**

### 1-5. 서버용 서비스 계정 키 (3단계 전에 필요)
1. **프로젝트 설정(톱니바퀴) → 서비스 계정 → 새 비공개 키 생성** → JSON 파일 다운로드
2. 이 파일은 **비밀값**입니다. 채팅에 붙여넣지 말고, 아래 Netlify 환경변수 `FIREBASE_SERVICE_ACCOUNT`에 JSON 전체를 그대로 붙여넣습니다.

## 2. 새 Netlify 사이트 만들기

1. https://app.netlify.com → **Add new site → Import an existing project → GitHub**
2. 저장소 `goldriver365k/sns` 선택 (기존 사이트를 선택하지 말고 새 사이트로 만듭니다)
3. 빌드 설정은 저장소의 `netlify.toml`이 자동 적용됩니다. (명령 `npm run build`, 게시 폴더 `dist`)
4. 배포할 브랜치: 지금은 작업 브랜치 `claude/ai-content-manager-firebase-y1cwys`, 나중에 `main`으로 합칩니다.

### 2-1. 환경변수 입력
**Site configuration → Environment variables → Add a variable**

| 이름 | 값 | 비고 |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` 외 5개 | 1-1의 firebaseConfig 값 | 브라우저용(공개 가능) |
| `VITE_ADMIN_EMAILS` | `higidia@gmail.com` | 화면 접근 허용 |
| `ADMIN_EMAILS` | `higidia@gmail.com` | 서버 접근 허용 |
| `FIREBASE_SERVICE_ACCOUNT` | 1-5 JSON 전체 | **비밀값** |
| `OPENAI_API_KEY` | OpenAI 키 | **비밀값**, 3단계 전에 |
| `OPENAI_MODEL` | 사용할 모델 이름 | 3단계 전에 |
| `NEWS_API_KEY` | 뉴스 API 키 | 9단계에서 |

환경변수를 바꾼 뒤에는 **Deploys → Trigger deploy**로 다시 배포해야 반영됩니다.

## 3. 로컬에서 실행 (선택)

```bash
cp .env.example .env   # 값 채우기
npm install
npm run dev
```

## 관리자 이메일을 바꾸거나 추가할 때

다음 세 곳을 함께 수정해야 합니다.
1. `firestore.rules`, `storage.rules`의 이메일 목록 → Firebase 콘솔에 다시 게시
2. Netlify 환경변수 `VITE_ADMIN_EMAILS`, `ADMIN_EMAILS` → 다시 배포
