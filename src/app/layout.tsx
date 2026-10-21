import type { Metadata } from 'next';
import './globals.css';
import { THEME_SCRIPT_CODE } from '@/hooks/useTheme';
import { getBrandConfig } from '@/lib/brand';
import { normalizeFontSize } from '@/lib/font-size';
import { getUserPreference } from '@/lib/preferences';
import type { ThemeMode } from '@/types';
import { Providers } from './providers';

// DB 不可用时降级为默认值，保证登录页 / 静态外壳仍可渲染（错误边界无法捕获根布局自身的抛错）
async function safePreference<T>(key: string, fallback: T): Promise<T> {
  try {
    return await getUserPreference<T>(key, fallback);
  } catch (error) {
    console.error('读取用户偏好失败，使用默认值', error);
    return fallback;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandConfig();
  // AUTH_URL 用于生成分享图片绝对地址；未设置时回退至
  // http://localhost:3000，消除构建阶段 metadataBase 警告
  let metadataBase: URL;
  try {
    metadataBase = new URL(process.env.AUTH_URL ?? 'http://localhost:3000');
  } catch {
    // AUTH_URL 格式非法时回退至本地默认地址
    metadataBase = new URL('http://localhost:3000');
  }
  return {
    metadataBase,
    title: brand.title,
    description: '自托管个人导航站',
    // 指定双核浏览器使用 WebKit 内核
    other: {
      renderer: 'webkit',
    },
  };
}

const ENTRANCE_GATE_SCRIPT = `(function(){try{if(sessionStorage.getItem('douhang-launched')==='1'){document.documentElement.dataset.entered='1';}sessionStorage.setItem('douhang-launched','1');}catch(e){}})();`;

/** 现代浏览器特性探针：仅凭原生特性支持判定（Chrome 123+ / Firefox 128+ / Safari 17.5+），零 UA 解析负担 */
const BROWSER_PROBE_SCRIPT = `(function(){
  try {
    var path = (window.location && window.location.pathname) || '';
    if (path.indexOf('/outdated.html') !== -1) return;
    if (path.indexOf('/browsers/') === 0) return;
    try {
      if (window.sessionStorage && window.sessionStorage.getItem('douhang-ignore-browser-check') === '1') return;
    } catch (e) {}

    var c = window.CSS;
    var ok = c && c.supports && c.supports('color', 'light-dark(red,blue)') && ('registerProperty' in c);
    if (!ok) {
      var s = (window.location && window.location.search) || '';
      window.location.replace('/outdated.html?from=' + encodeURIComponent((path || '/') + s));
    }
  } catch (err) {}
})();`.replace(/\\s+/g, ' ');

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const rawTheme = await safePreference<unknown>('theme', 'system');
  const theme: ThemeMode =
    rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system'
      ? rawTheme
      : 'system';
  const rawFontSize = await safePreference<unknown>('fontSize', 100);
  const fontSize = normalizeFontSize(rawFontSize);
  const isDark = theme === 'dark';
  // 仅显式 light/dark 由 SSR 输出主题属性；system 不输出任何明暗信息，
  // 交给 THEME_SCRIPT_CODE 在首帧前解析（localStorage → 系统偏好）。
  // 若 system 也强制输出 light，inline 脚本会采信该显式值并覆盖 localStorage，
  // 导致暗色系统用户白闪 + 「跟随系统」偏好被改写为 light。
  const explicitTheme =
    theme === 'dark' || theme === 'light' ? theme : undefined;

  return (
    // 显式主题由 SSR 直接输出，避免客户端拿到偏好后二次切换
    // inline style 让浏览器解析 HTML 时立即应用主题，不等外部 CSS 加载
    // system 实际明暗由 inline script 在首帧前同步（按 localStorage 及系统偏好解析）
    // suppressHydrationWarning：让 React 接受 DOM 实际值（被 inline script 改过）而非 SSR 输出
    <html
      lang="zh-CN"
      data-theme={explicitTheme}
      style={{
        colorScheme: explicitTheme,
        backgroundColor: isDark
          ? '#1b1b1b'
          : explicitTheme
            ? '#f1f1f1'
            : undefined,
        fontSize: `${fontSize}%`,
      }}
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        {/* 现代浏览器特性探针：首帧前同步阻断不合格旧内核浏览器 */}
        <script
          id="browser-probe"
          dangerouslySetInnerHTML={{ __html: BROWSER_PROBE_SCRIPT }}
        />
        {/* 主题初始化必须是普通同步脚本；next/script 会推入 __next_s 队列。 */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT_CODE }}
        />
        {/* 入场动画会话门控：首访播放一次，会话内二次访问标记 data-entered 直接呈现 */}
        <script
          id="entrance-gate"
          dangerouslySetInnerHTML={{
            __html: ENTRANCE_GATE_SCRIPT,
          }}
        />
      </head>
      <body
        className="min-h-full flex flex-col"
        // 某些浏览器扩展会在 hydration 前给 body 注入 data-* 属性
        // 例如 data-atm-ext-installed，允许这类非业务属性差异避免开发期误报
        suppressHydrationWarning
      >
        <Providers initialFontSize={fontSize} initialTheme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
