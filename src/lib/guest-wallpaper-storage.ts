'use client';

/**
 * 游客本机壁纸存储（基于浏览器 IndexedDB，零网络上传，零服务端开销）
 *
 * 保证游客的自定义壁纸安全保存在访客自身浏览器沙箱中，
 * 不向服务器传输任何字节，彻底杜绝服务器存储被滥用或产生安全风险。
 */

const DB_NAME = 'douhang-local-store';
const STORE_NAME = 'guest_assets';
const WALLPAPER_KEY = 'custom-wallpaper';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB 不受支持'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 保存游客自定义壁纸 Data URL */
export async function saveGuestCustomWallpaper(dataUrl: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(dataUrl, WALLPAPER_KEY);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** 读取游客自定义壁纸 Data URL */
export async function getGuestCustomWallpaper(): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(WALLPAPER_KEY);

      req.onsuccess = () => {
        resolve(typeof req.result === 'string' ? req.result : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** 清除游客自定义壁纸 */
export async function deleteGuestCustomWallpaper(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(WALLPAPER_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}
