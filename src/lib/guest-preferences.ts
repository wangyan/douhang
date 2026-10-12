'use client';

/**
 * 游客双层偏好模式（Local-First Override）辅助库
 *
 * 管理员在后台配置落库的偏好作为全站的基线默认值；
 * 游客在未登录状态下的自定义调整纯保存在当前浏览器 localStorage 中，不发起服务端写请求。
 */

import { deleteGuestCustomWallpaper } from '@/lib/guest-wallpaper-storage';

export const GUEST_CUSTOM_WALLPAPER_ID = 'local-custom';

export const GUEST_PREF_KEYS = {
  THEME: 'douhang-theme',
  CARD_SIMPLE_MODE: 'douhang-card-simple-mode',
  CARD_DENSITY: 'douhang-card-density',
  CARD_STATUS_BADGE: 'douhang-card-status-badge',
  FONT_SIZE: 'douhang-font-size',
  WALLPAPER: 'douhang-wallpaper',
  WALLPAPER_SCRIM: 'douhang-wallpaper-scrim',
} as const;

export const WALLPAPER_CHANGE_EVENT = 'douhang-wallpaper-change';
export const WALLPAPER_SCRIM_EVENT = 'douhang-wallpaper-scrim-change';

/** 读取本地游客偏好 */
export function getGuestPreference<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    if (typeof fallback === 'boolean') {
      return (raw === 'true') as unknown as T;
    }
    if (typeof fallback === 'number') {
      const num = Number(raw);
      return (Number.isFinite(num) ? num : fallback) as unknown as T;
    }
    return raw as unknown as T;
  } catch {
    return fallback;
  }
}

/** 写入本地游客偏好 */
export function setGuestPreference(
  key: string,
  value: string | number | boolean,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

/** 移除单个本地游客偏好 */
export function removeGuestPreference(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** 清除所有本地游客外观自定义（一键恢复站长全局默认） */
export async function clearAllGuestPreferences(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    for (const key of Object.values(GUEST_PREF_KEYS)) {
      localStorage.removeItem(key);
    }
    await deleteGuestCustomWallpaper();
  } catch {}
}

/** 检查当前是否存在游客本地外观自定义项 */
export function hasGuestPreferences(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Object.values(GUEST_PREF_KEYS).some(
      (key) => localStorage.getItem(key) !== null,
    );
  } catch {
    return false;
  }
}
