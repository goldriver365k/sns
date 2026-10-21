/**
 * 이 기기 브라우저 안의 파일 저장소(IndexedDB) — 무료, 이 기기에서만 보임.
 * 릴스 자료의 원본 파일(사진·영상)을 자료 id로 보관한다.
 */
const DB_NAME = 'snsroom-reels'
const STORE = 'files'

let opening: Promise<IDBDatabase> | null = null

function openDb() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('이 브라우저는 파일 저장을 지원하지 않습니다.'))
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('브라우저 저장소를 열지 못했습니다.'))
    })
    opening.catch(() => (opening = null))
  }
  return opening
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('브라우저 저장소 작업에 실패했습니다.'))
  })
}

export async function putFile(id: string, blob: Blob) {
  try {
    await run('readwrite', (s) => s.put(blob, id))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('이 기기의 저장 공간이 부족해 파일을 저장하지 못했습니다. 안 쓰는 프로젝트를 지워 주세요.')
    }
    throw e
  }
}

export async function getFile(id: string): Promise<Blob | null> {
  try {
    return ((await run('readonly', (s) => s.get(id))) as Blob | undefined) ?? null
  } catch {
    return null
  }
}

export async function deleteFile(id: string) {
  try {
    await run('readwrite', (s) => s.delete(id))
  } catch {
    // 지우지 못해도 다음 작업에는 지장 없음
  }
}

/** 브라우저가 공간이 부족할 때 마음대로 지우지 않도록 요청 (지원 브라우저만) */
export function askPersistentStorage() {
  navigator.storage?.persist?.().catch(() => undefined)
}
