'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTheme } from '@/hooks/useTheme';
import {
  GUEST_CUSTOM_WALLPAPER_ID,
  GUEST_PREF_KEYS,
  getGuestPreference,
  WALLPAPER_CHANGE_EVENT,
  WALLPAPER_SCRIM_EVENT,
} from '@/lib/guest-preferences';
import { getGuestCustomWallpaper } from '@/lib/guest-wallpaper-storage';
import { findWallpaper } from '@/lib/wallpaper-client';
import {
  WALLPAPER_SCRIM_MAX,
  WALLPAPER_SCRIM_MIN,
  type Wallpaper,
  type WallpaperPreferences,
} from '@/types';

interface BackgroundLayerProps {
  wallpapers: Wallpaper[];
  preferences: WallpaperPreferences;
  /** 遮罩强度 0-80（百分比），由调用方归一化 */
  scrim: number;
  /** 是否已登录（已登录管理员直显数据库全局壁纸，未登录游客支持本地覆盖） */
  isAuthed?: boolean;
}

/**
 * 客户端挂载标志
 *
 * 为什么需要这个？
 * - useTheme() 基于 useSyncExternalStore，SSR + 首次 hydration 用
 *   getServerSnapshot（mode='system', systemPrefersDark=false），
 *   解析出 resolved='light'。
 * - 挂载后切换到客户端快照（真实 mode + 真实 systemPrefersDark）。
 * - 如果 SSR 渲染 light 壁纸，客户端首次 hydration 也必须输出 light，
 *   否则 hydration mismatch，div 被 React 丢弃重建。
 *
 * 方案：SSR 和首次 hydration 都返回 null（不渲染壁纸），挂载后
 * 才渲染。这样无 mismatch，且客户端能正确响应系统主题变化。
 * - useTheme 的 useSyncExternalStore 订阅 matchMedia 'change' 事件，
 *   系统切换 light/dark 时会自动 re-render，壁纸跟着切换。
 * - 首屏壁纸挂载前，显示 html 的 theme background-color 默认背景。
 */
function useMounted(): boolean {
  // getServerSnapshot 恒 false（SSR 与首次 hydration 不渲染壁纸），
  // 客户端快照恒 true；挂载态不会再变，所以订阅是空函数
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * 主页背景层
 *
 * 渲染一个 fixed 定位 div 覆盖整个视口作为背景层：
 * - 独立于 <html> background，避免浏览器扩展与框架样式重置对根元素背景的干扰
 * - fixed + inset-0 + -z-10：覆盖整个视口，位于内容之下
 * - AppShell 内部 main 元素已通过 globals.css 设为透明，让背景层透出
 * - 50% 黑/白遮罩叠加在壁纸之上，保证前景内容可读性
 * - 支持双层偏好体系：未登录游客优先采信本机 localStorage 自定义覆盖，
 *   并通过自定义事件即时响应外观面板的无刷新切换
 * - 无壁纸时返回 null，回退到主题默认背景色
 */
export function BackgroundLayer({
  wallpapers,
  preferences,
  scrim,
  isAuthed = true,
}: BackgroundLayerProps) {
  const mounted = useMounted();
  const { resolved } = useTheme();

  // 本地覆盖状态（游客 Local-First 模式）
  const [localWallpaperId, setLocalWallpaperId] = useState<string | null>(
    preferences.wallpaper ?? null,
  );
  const [localCustomDataUrl, setLocalCustomDataUrl] = useState<string | null>(
    null,
  );
  const [localScrim, setLocalScrim] = useState<number>(scrim);

  useEffect(() => {
    // 管理员直显全局偏好；未登录游客优先采信本地覆盖
    if (!isAuthed) {
      const guestWp = getGuestPreference<string | null>(
        GUEST_PREF_KEYS.WALLPAPER,
        null,
      );
      if (guestWp !== null) {
        setLocalWallpaperId(guestWp === 'none' ? null : guestWp);
        if (guestWp === GUEST_CUSTOM_WALLPAPER_ID) {
          void getGuestCustomWallpaper().then((url) => {
            setLocalCustomDataUrl(url);
          });
        }
      } else {
        setLocalWallpaperId(preferences.wallpaper ?? null);
      }

      const guestScrim = getGuestPreference<number | null>(
        GUEST_PREF_KEYS.WALLPAPER_SCRIM,
        null,
      );
      if (guestScrim !== null) {
        setLocalScrim(guestScrim);
      } else {
        setLocalScrim(scrim);
      }

      // 监听游客壁纸即时变更事件
      const handleWpChange = (e: Event) => {
        const val = (e as CustomEvent<string | null>).detail;
        const targetId = val === 'none' ? null : val;
        setLocalWallpaperId(targetId);
        if (targetId === GUEST_CUSTOM_WALLPAPER_ID) {
          void getGuestCustomWallpaper().then((url) => {
            setLocalCustomDataUrl(url);
          });
        }
      };
      // 监听游客遮罩即时变更事件
      const handleScrimChange = (e: Event) => {
        const val = (e as CustomEvent<number>).detail;
        if (typeof val === 'number') setLocalScrim(val);
      };

      window.addEventListener(WALLPAPER_CHANGE_EVENT, handleWpChange);
      window.addEventListener(WALLPAPER_SCRIM_EVENT, handleScrimChange);
      return () => {
        window.removeEventListener(WALLPAPER_CHANGE_EVENT, handleWpChange);
        window.removeEventListener(WALLPAPER_SCRIM_EVENT, handleScrimChange);
      };
    }

    setLocalWallpaperId(preferences.wallpaper ?? null);
    setLocalScrim(scrim);
  }, [isAuthed, preferences.wallpaper, scrim]);

  // SSR 或首次 hydration 前不渲染：
  // - 服务端不知道客户端系统主题，渲染的壁纸一定不对
  // - 挂载后 useTheme 切换到客户端快照，resolved 正确响应系统主题
  if (!mounted) {
    return null;
  }

  // 一张图适配两种主题（light/dark 共用），读取有效壁纸字段
  const activeId = localWallpaperId;
  const isCustomLocal = activeId === GUEST_CUSTOM_WALLPAPER_ID;
  const wallpaper =
    !isCustomLocal && activeId ? findWallpaper(wallpapers, activeId) : null;
  const bgUrl = isCustomLocal ? localCustomDataUrl : wallpaper?.path;

  if (!bgUrl) {
    return null;
  }

  // 遮罩强度可由外观设置调节（0-80），默认 50 保持历史观感
  const strength = Math.min(
    WALLPAPER_SCRIM_MAX,
    Math.max(WALLPAPER_SCRIM_MIN, localScrim),
  );
  const overlay =
    resolved === 'dark'
      ? `linear-gradient(rgba(0,0,0,${strength / 100}), rgba(0,0,0,${strength / 100}))`
      : `linear-gradient(rgba(255,255,255,${strength / 100}), rgba(255,255,255,${strength / 100}))`;

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat pointer-events-none"
      style={{
        backgroundImage: `${overlay}, url(${bgUrl})`,
      }}
    />
  );
}
