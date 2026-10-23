'use client';

import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LinkProvider } from '@astryxdesign/core/Link';
import '@astryxdesign/core/reset.css';
import { ToastViewport } from '@astryxdesign/core/Toast';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import Link from 'next/link';
import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { useTheme } from '@/hooks/useTheme';
import { astryxZh } from '@/lib/astryx-locale-zh';
import { installContextMenuAnchorFallback } from '@/lib/context-menu-anchor-fallback';
import { installContextMenuTouchGuard } from '@/lib/context-menu-touch-guard';
import { GUEST_PREF_KEYS } from '@/lib/guest-preferences';
import { installLegacyLayerFallback } from '@/lib/legacy-layer-fallback';
import { errorMiddleware } from '@/lib/request/middleware';
import { swrFetcher } from '@/lib/request/request';
import { preferencesApi } from '@/services';
import type { FontSizePreference, ThemeMode } from '@/types';

interface ProvidersProps {
  children: React.ReactNode;
  initialFontSize: FontSizePreference;
  initialTheme: ThemeMode;
}

export function Providers(props: ProvidersProps) {
  return (
    <SessionProvider>
      <AppProviders {...props} />
    </SessionProvider>
  );
}

function AppProviders({
  children,
  initialFontSize,
  initialTheme,
}: ProvidersProps) {
  // SSR 已读取数据库偏好；hydration 首帧必须保持同一主题，避免二次切换
  const { mode, resolved, setMode } = useTheme(initialTheme);
  const { status } = useSession();
  const { data: prefs } = useSWR(preferencesApi.getKey, preferencesApi.get);
  const reconciledAuth = useRef<boolean | null>(null);
  const isAuthenticated = status === 'authenticated';

  // 管理员按数据库默认值对账一次，游客保留本机主题。
  useEffect(() => {
    if (status === 'loading' || !prefs?.theme) return;
    if (reconciledAuth.current === isAuthenticated) return;
    reconciledAuth.current = isAuthenticated;
    if (isAuthenticated && prefs.theme !== mode) setMode(prefs.theme);
  }, [isAuthenticated, mode, prefs?.theme, setMode, status]);

  useEffect(() => {
    // 挂载后若本地有游客定制的字号偏好，优先采用本地偏好
    let effective = prefs?.fontSize ?? initialFontSize;
    try {
      const stored = localStorage.getItem(GUEST_PREF_KEYS.FONT_SIZE);
      if (stored !== null) {
        const num = Number(stored);
        if (Number.isFinite(num) && num > 0) effective = num;
      }
    } catch {}
    document.documentElement.style.fontSize = `${effective}%`;
  }, [initialFontSize, prefs?.fontSize]);

  // 老内核浏览器（如 360 极速）不支持 CSS anchor positioning，
  // 右键菜单位置会退化；仅在不支持时安装 JS 定位降级
  useEffect(() => {
    const uninstallTouchGuard = installContextMenuTouchGuard();
    const uninstallAnchorFallback = installContextMenuAnchorFallback();
    const uninstallLegacyLayerFallback = installLegacyLayerFallback();
    return () => {
      uninstallTouchGuard();
      uninstallAnchorFallback?.();
      uninstallLegacyLayerFallback?.();
    };
  }, []);

  // 用解析后的明暗值，避免 Astryx system 模式移除 html[data-theme]
  // 后与项目内依赖 data-theme 的暗色样式产生两种主题混用
  return (
    <Theme theme={neutralTheme} mode={resolved}>
      <InternationalizationProvider locale="zh" messages={{ zh: astryxZh }}>
        <LinkProvider component={Link}>
          <SWRConfig
            value={{
              fetcher: swrFetcher,
              revalidateOnFocus: true,
              revalidateOnReconnect: true,
              revalidateIfStale: true,
              errorRetryCount: 0,
              use: [errorMiddleware],
            }}
          >
            <ToastViewport position="topEnd">
              <ServiceWorkerRegister />
              {children}
            </ToastViewport>
          </SWRConfig>
        </LinkProvider>
      </InternationalizationProvider>
    </Theme>
  );
}
