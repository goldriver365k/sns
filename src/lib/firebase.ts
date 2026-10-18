import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const env = import.meta.env

// 이 프로젝트 전용 Firebase(snsroom) 웹 앱 설정.
// 공개되어도 되는 식별자이며, 데이터 보호는 보안 규칙이 담당한다. 환경변수가 있으면 그 값을 우선 쓴다.
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyB3yMiNTBEtO8lkXLnpZeg0h8bhMyotQ3s',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'snsroom.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'snsroom',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'snsroom.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '966261213413',
  appId: env.VITE_FIREBASE_APP_ID || '1:966261213413:web:9f2246b300c26894f5ac0c',
}

/** 필수 설정값이 모두 들어 있는지 확인한다. 없으면 설정 안내 화면을 보여준다. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // 값이 비어 있는(undefined) 항목은 저장 오류 대신 건너뛴다(편집기 초기화 등)
  db = initializeFirestore(app, { ignoreUndefinedProperties: true })
  storage = getStorage(app)
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export { app, auth, db, storage }
